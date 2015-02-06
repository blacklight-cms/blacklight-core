
var bcms = require("../..");
var content= require("../jcr-content.json")
var components = require("../../lib/components");
var models = require("../../lib/models");
var Q = require("q");


console.log("before the damn Q");
var page = delay(1000)
	.then(function(val){
		console.log("all done:", val);
	})

console.log("after the damn Q:");


function delay(ms) {
	console.log("Started delay()");
    var deferred = Q.defer();
    setTimeout(function(){deferred.resolve("blah")}, ms);    
    return deferred.promise;
}


// components.config({root:__dirname});

// var model = models.process(content);

// cmp = components.get("mycompany/pages/home-page");

// console.log(cmp);



/// recurse down the jcr tree, 
//  you DON'T need to put promises into the tree.  Rather, put them into an array.  
//  Each promise's "then" will be responsible for placing resolved values into the correct place in the tree.

models.process(content)
	.then(
		function(page){

		}
	)





//bcms.render(content);  ///should this return a promise?


