


//// TODO: What is your plan for re-usable, shareable components?  
//// TODO: Question, does the site-creation environment prioritize the developer experience?  or the non-developer experience?  Answer: developer first.


var registry = require("../../lib/component-types").createRegistry({appRoot: __dirname});

var cmp = registry.get("mycompany/pages/home-page");

//console.log(cmp)


var models = require("../../lib/models");
var raw=require("../jcr-content.json");

models.generatePageModel(raw, registry)
	.then(function(model){
		//console.log("OK, got a page model");
		//console.log("My page model:", JSON.stringify(model, null, "   "));
		console.log(registry.render(model.page));
	})
	.catch(function(error){
		console.log("Unhandled error in promise chain, foo.js: ", error);
	});

