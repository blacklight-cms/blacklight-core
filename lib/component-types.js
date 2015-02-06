var fs = require("fs");
var _path = require("path");
var dust=require("dustjs-linkedin");

var ex = module.exports;

var cache = {};
var config = {};
var componentTypeRoot="unspecified_root/";

function ComponentType(partialPath){
	this.resourceType = partialPath;
	this.path = _path.join(componentTypeRoot, "componentTypes", partialPath);

	if(!fs.existsSync(this.path)){
		this.error="Resource path not found: " + this.path;
		return;
	};

	//TODO: look for more template types, maybe based on a template engine registry
	dustPath = _path.join(this.path, "view.dust");
	try{
		this.template = fs.readFileSync(dustPath, "utf8");
		var compiled = dust.compile(this.template, partialPath);
		dust.loadSource(compiled);
	}
	catch(err){
		this.error = err;
		return;
	}
	
}


ex.get=function(path){
	if(cache[path]){
		return cache[path];
	}else{
		var componentType = new ComponentType(path);
		if(componentType){
			cache[path]=componentType;
		}
		return componentType;
	}
}


ex.configure=function(options){
	
	if(!options.root)throw({error: "'root' must be specified when configuring componentTypes module"});

	componentTypeRoot = options.root;
}