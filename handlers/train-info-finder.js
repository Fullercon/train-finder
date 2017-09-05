var async = require('async');
var Darwin = require('national-rail-darwin');
var darwin = new Darwin(process.env.DARWIN_API_KEY);
var helpers = require('./helpers');
var request = require('request');

if(process.env.CUSTOM_PROXY){
    request = request.defaults({'proxy':process.env.CUSTOM_PROXY});
}

/*EXPORTS START*/
exports.version = '1.0.0';

exports.getTrainDetailsByQueryParams = function(req, response){
    console.log('Fetching query parameters from GET request');

    var params = req.query;

    var departureStation = params.departure;
    var arrivalStation = params.arrival;

    if(!departureStation || !arrivalStation){
        var error = helpers.make_error(500, "Missing either departure or arrival parameters - cannot perform lookup.");
        return helpers.send_failure(response, error);
    }

    async.waterfall(
        [
            function(callback){
                getTrainDetailsNotification(departureStation, arrivalStation, callback)
            },
            function(notificationData, callback){
                sendPostRequestToIfft(notificationData, callback)
            }
        ],
        function(err, results){
            if(err){
                helpers.send_failure(response, err);
                return;
            }
            console.log("Successfully sent notification to ifttt server.");
            helpers.send_success(response, results);
        }
    );
};

exports.getTrainDetailsByPost = function (req, response){
    var departureStation = req.body.departure;
    var arrivalStation = req.body.arrival;

    if(!req.body || !departureStation || !arrivalStation){
        var error = helpers.make_error(500, "Missing either departure or arrival data in request body.");
        return helpers.send_failure(response, error);
    }

    async.waterfall(
        [
            function(callback){
                getTrainDetailsNotification(departureStation, arrivalStation, callback)
            },
            function(notificationData, callback){
                sendPostRequestToIfft(notificationData, callback)
            }
        ],
        function(err, results){
            if(err){
                helpers.send_failure(response, err);
                return;
            }
            console.log("Successfully sent notification to ifttt server.");
            helpers.send_success(response, results);
        }
    );
};

exports.testIfftConnection = function (req, res){

    var object = { "value1" : "Hello ",
        "value2" : "This is great! ",
        "value3" : "Bye"
    };

    var options = {
        url : 'https://maker.ifttt.com/trigger/email_test/with/key/' + process.env.IFTTT_API_KEY,
        method: "POST",
        json: true,
        body: object
    };

    request(options, function(err, results){
        console.log(err);
        /*Returns statusCode i.e. 200, statusMessage i.e. OK, body i.e. Congratulations! You've fire the email_test event etc*/
        helpers.send_success(res, results);
    });
};


function sendPostRequestToIfft(data, callback){
    console.log("Sending request to ifttt server.");

    var object = { "value1" : data.responseText,
        "value2" : data.time
    };

    var options = {
        url : 'https://maker.ifttt.com/trigger/train_details/with/key/' + process.env.IFTTT_API_KEY,
        method: "POST",
        json: true,
        body: object
    };

    request(options, function(err, results){
        if(err || results.statusCode != 200){
            console.log(err);
            var error = helpers.ifttt_connection_error();
            return callback(error, null);
        }

        console.log("Response from IFTTT: " + results.body);
        callback(null, results);
    });
}

/*EXPORTS END*/

/*HELPER METHODS START*/

function getDetailsForBothStations(departure, arrival, callback){
    async.parallel(
        [
            function(asyncCallback){
                console.log("Fetching station details for " + departure + "");
                darwin.getStationDetails(departure, asyncCallback);
            },
            function(asyncCallback){
                console.log("Fetching station details for " + arrival + "");
                darwin.getStationDetails(arrival,asyncCallback);
            }
        ],

        function(err, results){
            if(err){
                console.log("Error occurred when fetching station details: " + err);
                callback(err, null);
                return;
            } else if (results[0].length == 0 || results[1].length == 0){
                console.log("One or more of the stations could not be found.");
                callback(null, null);
                return;
            }

            callback(null, results);
        }
    );
}

function getNextDepartureBetweenStations(departureCRS, arrivalCRS, callback){

    darwin.getNextDepartureWithDetails(departureCRS, arrivalCRS, {}, function(err, results){
        if(err){
            console.log(err);
            callback(err, null);
            return;
        }

        callback(null, !isEmptyObject(results.trainServices[0]) ? trimTrainDetails(results.trainServices[0]) : null);
    })
}

function getTrainDetailsNotification(departureStation, arrivalStation, callback){
    async.waterfall(
        [
            function(callback){
                console.log("Fetching details for departure station: " +departureStation + " & arrival station: " + arrivalStation);
                getDetailsForBothStations(departureStation, arrivalStation, callback);
            },
            function(stationDetails, callback){
                if(!stationDetails){
                    var error = helpers.invalid_station();
                    callback(error, null);
                } else {
                    var crsCodes = createCRSCodeObject(stationDetails[0], stationDetails[1]);
                    console.log("Getting next departure from CRS code: "+crsCodes.departureCode +" to CRS code: "+crsCodes.arrivalCode);
                    getNextDepartureBetweenStations(crsCodes.departureCode, crsCodes.arrivalCode, callback);
                }
            }
        ],
        function (err, results){
            if (err){
                console.log(err);
                return callback(err, null);
            }

            var responseObject = {};
            responseObject.responseText = formatResponseTextGivenTrainDetails(results, departureStation, arrivalStation);
            responseObject.statusCode = 200;
            var time = new Date();
            responseObject.time = time.getHours() + ":" + time.getMinutes();

            callback(null, responseObject);
        }
    );
}

function formatResponseTextGivenTrainDetails(trainDetails, departureStation, arrivalStation){
    console.log("Formatting response for notification");

    if (!trainDetails){
        return "Sorry, there are currently no services between " + departureStation + " and " + arrivalStation + ".";
    }

    var responseText = "The " + trainDetails.scheduledDepartureTime + " "
        + trainDetails.operator + " service to " + trainDetails.destination + " ";

    if(trainDetails.cancelled){
        responseText += "has been cancelled, due to " + trainDetails.cancellationReason +".";
        return responseText;
    }

    if(trainDetails.platform){
        responseText += "will be on Platform " + trainDetails.platform + ". ";
    } else {
        responseText += "has not yet been allocated a platform. "
    }

    responseText += "Estimated departure time: " + trainDetails.estimatedDepartureTime;

    if(trainDetails.estimatedDepartureTime && trainDetails.estimatedDepartureTime != 'On time' && trainDetails.estimatedDepartureTime != 'Delayed'){
        var minutesLate = calculateMinutesLate(trainDetails.scheduledDepartureTime, trainDetails.estimatedDepartureTime);
        responseText += " (" + minutesLate + " minute(s) late)";
    }

    return responseText + ".";
}

function createCRSCodeObject(departureDetails, arrivalDetails){
    var departureCode = getCRSCodeFromTrainDetails(departureDetails);
    var arrivalCode = getCRSCodeFromTrainDetails(arrivalDetails);

    return {departureCode:departureCode, arrivalCode:arrivalCode};
}

function getCRSCodeFromTrainDetails(details){
    return details[0].code;
}

function trimTrainDetails(trainDetails){
    var serviceDetails = {};

    serviceDetails.scheduledDepartureTime = trainDetails.std;
    serviceDetails.estimatedDepartureTime = trainDetails.etd;
    serviceDetails.operator = trainDetails.operator;
    serviceDetails.platform = trainDetails.platform;
    serviceDetails.cancelled = trainDetails.isCancelled;
    serviceDetails.cancellationReason = trainDetails.cancelReason;
    serviceDetails.delayReason = trainDetails.delayReason;
    serviceDetails.destination = trainDetails.destination.name;

    return serviceDetails;
}

function calculateMinutesLate(startTime, endTime){
    var date = new Date('01/01/1990 ' + startTime);
    var date2 = new Date('01/01/1990 ' + endTime);

    var difference = date2-date;

    return difference / 60000;
}

function isEmptyObject(object){
    return Object.keys(object).length === 0 && object.constructor === Object
}

/*HELPER METHODS END*/


