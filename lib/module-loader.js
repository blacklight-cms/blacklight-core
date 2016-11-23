
// Process all Blacklight modules and pre-load resources.

var fs=require("fs");
var _path=require("path");
var _=require("lodash");

var express=require("express");
var router=express.Router();
var rootedRouter=express.Router();
var moduleRouter = require("./module-router");
var siteModules=[];

module.exports=function(options){
	var applicationRoot=options.appRoot || global.bl.appRoot;
	var logger=global.bl.logger.get("blacklight-render.module-loader");

	//var hbManager=require(_path.resolve(applicationRoot, "apps/blacklight/edit/lib/edit-handlebars"))();
	// TODO: you were borrowing some registered helpers fromt the bl-edit handlebars module.  But that's a bad dependency.  But how to get those helpers back?

	var hb=require("handlebars");

	if(!applicationRoot){throw new Error("Must set 'global.bl.appRoot' for module-loader()");}

	/// find all helpers in "model-helpers" folder and "mount" them onto $
	var moduleAppsRoot=_path.resolve(applicationRoot, "apps/");


	var sites=fs.readdirSync(moduleAppsRoot);
	var results={templates:{}, services:{}, modelHelpers:{}, router: router, rootedRouter: rootedRouter, routePaths:[]};


	_.each(sites, function(site){
		var slingConnectors = options.siteConnections[site].slingConnectors || options.siteConnections[options.defaultSite].slingConnectors;
		if(!site.match(/\./)){
			var siteRoot=_path.resolve(moduleAppsRoot, site);

			var projects=fs.readdirSync(siteRoot);
			_.each(projects, function(project){		
				var files, services, hasRoutesJS, hasRoutesFolder;
				var projectRoot = _path.resolve(siteRoot, project);
				siteModules.push(site + "." + project);
				// model-helpers.js - routes.js - lib - templates
				try{files=fs.readdirSync(projectRoot);}
				catch(err){
					err.message="Could not read project folder: " + projectRoot + "\n" + err.message;
					logger.error(err.message);
				}

				_.each(files, function(file){
					var prefix;
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
							hasRoutesJS=true;
						break;

						/////////////////////////////////////////////////////////////
						case "routes":
							hasRoutesFolder=true;
						break;


						/////////////////////////////////////////////////////////////
						case "rooted-routes.js":
							results.modelHelpers[site]=results.modelHelpers[site]||{};
							try{
								var curRouter=require(path)({slingConnectors: slingConnectors, templates: results.templates, express: express});
								rootedRouter.use(curRouter);
							}catch(err){
								var message="ERROR: Problem with router found at path: " + path + "\n";
								err.message=message+err.message;
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
								var message2="ERROR: Problem with model-helper.js found at path: " + path + "\n";
								err.message=message2+err.message;
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


				////////////////////////////////////////////////////////////////////////////////////////////
				if(hasRoutesJS || hasRoutesFolder){
					var routerSettings={
							moduleId: site + "." + project,
							moduleAppRoot: projectRoot, 
							slingConnectors: slingConnectors, 
							getSlingByReq: function(req){return req.bl.sling;},
							templates: results.templates,
							express: express
						};
					var noop=function(req,res,next){next();};
					var folderRouter=noop, jsRouter=noop, route404=noop;
					var prefix="/" + site + "/" + project;

					if(hasRoutesFolder){
						folderRouter=moduleRouter(routerSettings);
					}

					if(hasRoutesJS){
						var path=_path.resolve(projectRoot,"routes.js");
						var routesJS = require(path);
						if(typeof routesJS === "function"){
							try{
								jsRouter=routesJS(routerSettings);
							}catch(err){
								var msg="ERROR: Problem with router found at path: " + path + "\n";
								err.message=msg+err.message;
								throw err;
							}
						}
						route404 = routesJS[404] || noop;
						results.handle404 = route404;
					}

					router.use(prefix + "/", jsRouter, folderRouter, route404);
					results.routePaths.push(prefix + "/");  // TODO: enumerate each individual folder route (i.e. JS file), if any.
				}


			});		
		}
	});



	//////////////////////////////////////////////////////////////////////	
	function loadTemplates(path, templateStore, prefix){

		function compileTemplate(base, fullPath){						
			fs.readFile(fullPath, function(err, data){
				try{
					var templateBody = data.toString();
					templateStore[base]=hb.compile(templateBody);
					hb.registerPartial(prefix + base, templateStore[base]);
				}catch(error){
					error.message="Problem compiling Handlebars template at: "+fullPath + "\n" + error.message;
					throw(error);
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


	if(global && global.bl){
		global.bl.modules=results;
	}

	return results;

};


//////////////////////////////////////////////////////////////////////	
module.exports.listInstalledModules = function(){
	return siteModules;
};

