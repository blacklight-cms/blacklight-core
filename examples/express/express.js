var express=require("express");
var bx = require("../../lib/blacklight-express");
var SlingConnector = require("sling-connector");

var sc = new SlingConnector({baseUri: "http://127.0.0.1:4502/", username: "admin", password: "admin"})

var app = express();

app.use(bx({componentPaths: __dirname + "/components",  slingConnector: sc}));


var port = 3000;
app.listen(port, function(err){
	if(err){
		console.log("Error starting app: " + err);
	}else{
		console.log("Listening on port " + port);
	}
});

