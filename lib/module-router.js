var _path=require("path");
var fs=require("fs");
var _=require("lodash");

module.exports=function(routerSettings){
	var filelist;
	var routesBase = routerSettings.moduleAppRoot + "/routes";
	var logger=global.bl.logger.get(routerSettings.moduleId);


	//**********************************************************************************
	// 
	//	
	var router=function(req, res, next){
		var processor = getProcessorsByPath(req);
		if(!processor){ next(); return;}

		var preprocessor = getProcessorsByPath({path:"/-preprocess.json"}) 
		preprocessor = preprocessor ? preprocessor.modelProcessor : function(model, $, cb){cb()};

		var $={
			page: processor.page,
			express: {req,res,next},
			sling: routerSettings.slingConnectors.getByReq(req).slingConnector,
			templates: routerSettings.templates,
			logger,
		};

		var model={};
		var timeoutInterval=processor.timeout || 15000;
		var timeout=setTimeout(function(){
			res.status(500).end("Error: No response from model processor within timeout interval of " + timeoutInterval/1000 + " seconds.\n" + 
				routesBase + processor.page.path + ".js" + "\n\n" +
				"Be sure to invoke the callback funtion.\nAlternately, set the module's 'timeout' export to a value higher than " + timeoutInterval + " ms."
				);
		}, timeoutInterval)

		preprocessor(model, $, function(err, preprocOptions){
			processor.modelProcessor.process(model, $, function(err, options){
				// TODO: render precendence: options, modelProcessor.render(), processor.template
				// TODO: content-type override, via extension, should be off by default.

				options = _.defaults(options, preprocOptions);

				if(processor.page.extension==="json"){
					res.json(model);
				}else{
					if(processor.template){
						res.header("content-type", "text/html").end(processor.template(model));
					}else{
						res.json(model);
					}
				}
			});
		});
	};


	//**********************************************************************************
	// Find best modelProcessor and template, based on requested path
	//	
	var getProcessorsByPath=function(req){
		if(!filelist){filelist={}; walksync(routesBase, filelist);}
		var parts=req.path.match(/(.*)\/([^\.]+)(.*)/) || ["", "/", ""];
		var selectors = parts[3].replace(/^\./,"").split(".");
		var extension = selectors.pop();

		var base = _path.join(parts[1], parts[2]).replace(/^\//,"");

		parts = base.split("/");
		var checkPath="", bestMatch;
		for(var i=0; i<parts.length; i++){
			var cur=parts[i];
			checkPath = checkPath + ("/" + cur);

			if(filelist[checkPath + ".js"]){
				bestMatch=checkPath;
			}else{
				if(bestMatch) {
					break;
				}
			}
		}

		var routePath = bestMatch;

		////////////////////////////////////////////////////////////////////////////////////////
		var jsPath = routePath + ".js";
		var modelProcessor = filelist[jsPath];
		
		if(!routePath || !modelProcessor){return null; }

		var action=base.slice(routePath.length).replace(/\/$/,"");

		if(modelProcessor===1){
			try{
				modelProcessor = require(routesBase + jsPath);
			}catch(err){
				err.message = "when loading route model processing script:\n" + routesBase + jsPath + "\n" + err.message;
				throw err;
			}
			filelist[jsPath]=modelProcessor;
		}

		////////////////////////////////////////////////////////////////////////////////////////
		var hbsPath = routePath + ".hbs";
		var template = filelist[hbsPath];

		if(template===1){			
			try{
				var tmplFile=fs.readFileSync(routesBase + hbsPath);
				template=global.bl.hb.compile(tmplFile.toString());
			}catch(err){
				err.message = "when compiling route template:\n" + routesBase + hbsPath + "\n" + err.message;
				throw err;
			}
			filelist[hbsPath]=template;
		}


		////////////////////////////////////////////////////////////////////////////////////////
		return {
			modelProcessor: modelProcessor, 
			template: template,
			page: {path:routePath, action: action, extension: extension, selectors: selectors}			
		};

	};




	//**********************************************************************************
	// Recursively list all .js and .hbs files in the given folder
	//
	var walksync = function(dir, filelist) {
		var files = fs.readdirSync(dir);

		files.forEach(function(file) {
			var full = dir + "/" + file;
			if (fs.statSync(full).isDirectory()) {
				walksync(full, filelist);
			} else {
				if (file.match(/\.(js|hbs)$/)){
					filelist[full.slice(routesBase.length)] = 1;
				}
			}
		});
		return filelist;
	};


	return router;
};



