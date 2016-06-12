
// Process all Blacklight modules and pre-load resources.

var fs=require("fs");
var _path=require("path");
var _=require("lodash");

var express=require("express");
var router=express.Router();
var rootedRouter=express.Router();

var siteModules=[];

module.exports=function(options){
	var applicationRoot=options.appRoot || global.bl.appRoot;

	//var hbManager=require(_path.resolve(applicationRoot, "apps/blacklight/edit/lib/edit-handlebars"))();
	// TODO: you were borrowing some registered helpers fromt the bl-edit handlebars module.  But that's a bad dependency.  But how to get those helpers back?

	var hb=require("handlebars");

	if(!applicationRoot){throw new Error("Must set 'global.bl.appRoot' for module-loader()");}

	/// find all helpers in "model-helpers" folder and "mount" them onto $
	var moduleAppsRoot=_path.resolve(applicationRoot, "apps/");


	var sites=fs.readdirSync(moduleAppsRoot);
	var results={templates:{}, services:{}, modelHelpers:{}, router: router, rootedRouter: rootedRouter, routePaths:[]};


	_.each(sites, function(site){
		if(!site.match(/\./)){
			var siteRoot=_path.resolve(moduleAppsRoot, site);

			var projects=fs.readdirSync(siteRoot);
			_.each(projects, function(project){		
				var files,services;
				var projectRoot = _path.resolve(siteRoot, project);
				siteModules.push(site + "." + project);
				// model-helpers.js - routes.js - lib - templates
				try{files=fs.readdirSync(projectRoot);}
				catch(err){err.message="Could not read project folder: " + projectRoot + "\n" + err.message; throw err;}
				_.each(files, function(file){
					var curRouter, prefix;
					var path=_path.resolve(projectRoot,file);
					switch(file){


						/////////////////////////////////////////////////////////////
						case "services":
							results.services[site]=results.services[site]||{};
							results.services[site][project]={};
							services=fs.readdirSync(path);
							_.each(services, function(service){
								var reg=service.match(/(.*)\.js/);
								if(reg)
									results.services[site][project][reg[1]] = require(_path.resolve(projectRoot, "services", service));
							});

						break;

						/////////////////////////////////////////////////////////////
						case "routes.js":
							results.modelHelpers[site]=results.modelHelpers[site]||{};
							try{
								curRouter=require(path)({slingConnectors: options.slingConnectors, templates: results.templates });
								prefix="/" + site + "/" + project;
								router.use(prefix + "/", curRouter);
								results.routePaths.push(prefix + "/");
							}catch(err){
								var msg="ERROR: Problem with router found at path: " + path + "\n";
								err.message=msg+err.message;
								throw err;
							}

						break;


						/////////////////////////////////////////////////////////////
						case "rooted-routes.js":
							results.modelHelpers[site]=results.modelHelpers[site]||{};
							try{
								curRouter=require(path)({slingConnectors: options.slingConnectors, templates: results.templates });
								rootedRouter.use(curRouter);
							}catch(err){
								var msg="ERROR: Problem with router found at path: " + path + "\n";
								err.message=msg+err.message;
								throw err;
							}

						break;


						/////////////////////////////////////////////////////////////
						case "model-helpers.js":
							results.modelHelpers[site]=results.modelHelpers[site]||{};
							var modelHelpers;

							try{
								modelHelpers=require(path);
							}catch(err){
								var msg="ERROR: Problem with model-helper.js found at path: " + path + "\n";
								err.message=msg+err.message;
								throw err;
							}
							results.modelHelpers[site][project]=modelHelpers;

						break;


						/////////////////////////////////////////////////////////////
						case "templates":
							results.templates[site]=results.templates[site]||{};
							prefix=site + "." + project + ".";
							results.templates[site][project]={};
							loadTemplates(path, results.templates[site][project], prefix);							
						break;


					}
				});
				// console.log("PROJECT:", projectRoot);
			});		
		}
	});



	//////////////////////////////////////////////////////////////////////	
	function loadTemplates(path, templateStore, prefix){

		function compileTemplate(base, fullPath){						
			fs.readFile(fullPath, function(err, data){
				try{
					templateStore[base]=hb.compile(data.toString());
				}catch(err){
					err.message="Problem compiling Handlebars template at: "+fullPath + "\n" + err.message;
					throw(err);
				}
			});
		}

		fs.readdir(path, function(err,files){
			for(var i=0; i< files.length;i++){				
				var name=files[i];
				var parts=name.split(".");
				if(parts[1]==="hbs"){
					compileTemplate(parts[0], _path.join(path, name));
				}
			}
		});

	}

	return results;

};


//////////////////////////////////////////////////////////////////////	
module.exports.listInstalledModules = function(){
	return siteModules;
};

