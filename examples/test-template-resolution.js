

var _=require("lodash");
var ct=require("../lib/component-types");

var list1 = 	[
		"dingy.hbs",
		"thingy.foo.POST.hbs",
		"thingy.mobile.droppy.hbs",
		"thingy.hbs",
		"thingy.baz.hbs",
		"thingy.tall.txt.hbs",
		"thingy.xml.hbs",
		"thingy.xml.print.hbs"
	];

var tests=[
	{s: ["print"], x: "xml", m: "GET"},
	{s: ["baz","mobile"], x: "html", m: "GET"},
	{s: ["baz","mobile"], x: "html", m: "POST"},
	{s: [""], x: "txt", m: "GET"},
	{s: [""], x: "txt", m: "POST"}
]

_.each(tests,function(test){
	console.log("\n\n----------------------\n", test)
	console.log(ct.findBestTemplateMatch(list1, "thingy", test.s, test.x, test.m));	
})




// var model = {b: "true", bass: {some:"super", duper: "thing"}, mass: {shut: "world", your: "mouth"}};


// var picked = _.pick(model,function(val,key){
// 	console.log(key, " : ", val);
// 	if(key[0]=="b")
// 		return true;
// 	else
// 		return false;
// })


// console.log("-------------------------\n", picked);