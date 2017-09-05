exports.version = '0.1.0';

exports.make_error = function(errorCode, msg){
    var e = new Error(msg);
    e.code = errorCode;
    return e;
};

exports.send_success = function(response, data){
    var output = {error: null, data:data};
    response.writeHead(200, {"Content-Type" : "application/json"});
    response.end(JSON.stringify(output) + "\n");
};

exports.send_failure = function(response, err){
    response.writeHead(err.code, {"Content-Type" : "application/json"});
    response.end(JSON.stringify({error: err.code, message: err.message}) + "\n");
};

exports.invalid_resource = function() {
    return exports.make_error(404, "invalid_resource: the requested resource does not exist.");
};


exports.bad_json = function(){
    return exports.make_error(500, "bad_json: the data is not in a valid JSON format");
};

exports.missing_data = function(data_field){
    return exports.make_error(500, "missing_data: Expected " + data_field + " but was missing.");
};

exports.invalid_station = function(){
    return exports.make_error(500, "invalid_station: one of the requested stations does not exist.");
};

exports.ifttt_connection_error = function(){
    return exports.make_error(500, "ifttt_connection_error: did not get a valid response from ifttt");
};