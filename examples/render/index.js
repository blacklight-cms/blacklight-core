
var createRegistry = require("../../lib/component-types").createRegistry
var models = require("../../lib/models");
var slingData=require("./jcr-content.json");

var registry = createRegistry({componentPaths: __dirname + "/components"});

models.generateModelFromRaw(slingData, registry)
	.then(function(model){
		console.log(registry.render(model.data));
	})
	.catch(function(error){
		console.log("Unhandled error in promise chain, render/index.js: ", error);
	});

