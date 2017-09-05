var express = require('express');
var helpers = require('./handlers/helpers');
var configLoadResult = require('dotenv').config({path: 'properties.env'});
var app = express();

var bodyParser = require('body-parser');
app.use(bodyParser.json());       // to support JSON-encoded bodies

var trainInfo = require('./handlers/train-info-finder');

app.post('/v1/train-details.json', trainInfo.getTrainDetailsByPost);

app.get('/v1/train-details.json', trainInfo.getTrainDetailsByQueryParams);

app.get('/v1/default-details.json', function(request, response){
    request.query = {departure: "London Cannon Street", arrival:"Elmers End"};
    trainInfo.getTrainDetailsByQueryParams(request, response);
});

app.get('/v1/ifttt', trainInfo.testIfftConnection);

app.get('*', four_oh_four);

function four_oh_four(req, res){
    console.log('404ing!');
    helpers.send_failure(res, helpers.invalid_resource());
}

if(configLoadResult.error){
    console.error("Could not load properties file, killing process.");
    process.exit();
} else {
    console.log("Application started running on port " + process.env.PORT);
    app.listen(process.env.PORT);
}


