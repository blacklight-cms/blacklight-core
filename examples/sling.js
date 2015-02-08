
var SlingConnector = require("sling-connector");


var sc = new SlingConnector({
	baseUri: "http://127.0.0.1:4502/"	
});

sc.get("/content/fourseasons/en/properties/alexandria/_jcr_content",
	function(err, data){
		console.log(data);
	});

