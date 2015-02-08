


//// TODO: What is your plan for re-usable, shareable components?  
//// TODO: Question, does the site-creation environment prioritize the developer experience?  or the non-developer experience?  Answer: make it good for the developer first, then for the non-developer.


var registry = require("../../lib/component-types").createRegistry({componentPaths: __dirname + "/components"});

var cmp = registry.get("mycompany/pages/home-page");


var models = require("../../lib/models");
var raw=require("./jcr-content.json");

models.generatePageModel(raw, registry)
	.then(function(model){
		console.log(registry.render(model.page));
	})
	.catch(function(error){
		console.log("Unhandled error in promise chain, foo.js: ", error);
	});

