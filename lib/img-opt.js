//TODO: Move into blacklight/index.js.   var imgOpt = blacklight.imgOpt(config.imageOptimizer);

var fs=require("fs");
var _path=require("path");
var express=require("express");
var mkdirp=require("mkdirp");
var execFile=require('child_process').execFile;
var tempCounter=1;
var request=require("request");
var _=require("lodash");
var log=global.bl.logger.get("img-opt");
var imageMagickOnly=false;

var installHelp={
	"imagemagick-convert":{
		"url":"http://www.imagemagick.org/",
		"instructions":"ImageMagick's convert utility.\n'brew install imagemagick' or with Linux package manager"
	}
};

//////////////////////////////////////////////////////////////////////////
/**  
 * Return an instance of an Express middleware which serves optimized versions of Sling JPEG imagery
 * @example
 * app.use("/[static-mount-point]/img-opt/", imgOpt(config.imageOptimizer));
 * Then, for a 70% quality JPEG, reference:  http://127.0.0.1:3000/alt/img-opt/images/sling-image.jpg/70.jpg  
 *
 * @param {string} options.cacheRoot - Local filesystem folder in which to store downloaded originals and renditions
 * @param {string} options.cjpeg - Path to mozjpeg cjpeg executable
 * @param {string} options.jpegtran - Path to mozjpeg jpegtran executable
 * @param {error-mailer} [options.emailError] - Fully-configured Blacklight error mailer
 * @param {int} [options.revalidateAge=86400] - How often, in seconds, to confirm with origin server that original version of image has not changed.  Default is 1 day.
 */
module.exports=function(options){

	var cacheRoot = options.cacheRoot;
	if(!cacheRoot){throw new Error("img-opt: Must specify options.cacheRoot");}
	if(!cacheRoot.match(/^\//)){throw new Error("img-opt: options.cacheRoot must begin with a slash");}

	validateExecutableConfiguration(options);


	var emailError = options.emailError || global.bl.emailError;
	var revalidateAge = options.revalidateAge || 86400;
	var sRGB_profile = _path.join(__dirname, "sRGB_IEC61966-2-1_black_scaled.icc");
	var imConvertExe = options["imagemagick-convert"];
	var cjpeg = options.cjpeg;
	var jpegtran = options.jpegtran;


	var tempRoot = _path.join(cacheRoot, "tmp");
	/// confirm executables exist at given path.
	
	mkdirp(tempRoot,function(err){if(err){throw(err);}});

	var staticHandler=express.static(options.cacheRoot, {etag: false});


	return function optimizeImage(req,res,next){
		var start=new Date();
		var parts = req.path.split("/");
		parts.shift();
		var mode = parts.shift();
		var optRequest = parts.pop();
		var imageName = parts[parts.length-1];
		var slingImg = ("/" + parts.join("/")).replace(/\/\.\.\/|\*/g,"/").replace(/\%20|\+/g," ");  // Cheap-o path sanitize


		var sc=req.bl.sling;
		if(!sc){
			allDone("Could not find slingConnector for specified mode: " + mode);
			return;
		}

		var imageRoot = _path.join(cacheRoot, mode, slingImg);
		var originalPath = _path.join(imageRoot, "original.jpg");
		var lastModifiedPath = _path.join(imageRoot, "last-modified");
		var optimizedPath = _path.join(imageRoot, optRequest);

		try{
		    ensureOriginalIsValid(function(err){
				if(err){allDone(err);return;}
		    	generateOptimized(function(err){
		    		if(err){allDone(err);return;}
		    		res.setHeader("cache-control", "max-age=31536000");
		    		staticHandler(req,res,next);
		    	});
		    });		
		}catch(err){
			allDone(err);
		}
	
		/********************************************************************************************/
	    function getTempFile(){
	    	return _path.join(tempRoot, ("0000" + tempCounter++).substr(-4) + "_" + process.pid + ".jpg" );
	    }

		/********************************************************************************************/
		function allDone(err){
			var end=new Date();
			if(err){
				log.error("Problem generating image: ", {err:err, stack:err.stack});
				//res.status(500).send("<b>Problem generating image:</b> " + err);
				res.status(302);
				res.setHeader("Location", slingImg);
				res.send("Temporary image error: " + err);

				if(emailError){emailError({subject: "Blacklight img-opt error", text: err, req: req});}
			}else{
				res.send("ok all saved: " + (end.getTime()-start.getTime()) + " ms");
			}
		}


		/********************************************************************************************/
		function generateOptimized(cb){
			var parts = optRequest.split(".");
			var extension = parts.pop();
			var qualityString = parts.shift();
			var quality = parseInt(qualityString);
			var sizing = parts.shift();
			var tempFile = getTempFile(), tempFile2=imageMagickOnly?"":getTempFile();

			if(sizing && !sizing.match(/^[\d\^\%\!<\>x]*$/)){
				cb("Bad sizing string: " + sizing); return;
			}

			if(isNaN(quality)){
				cb("Bad quality string: " + quality); return;
			}

			if(extension!=="jpg"){
				cb("Optimizer currently only handles the JPG extension"); return;
			}


			function execOptimization(imagePath, originalMtime){

				var imParams=["-profile",sRGB_profile];
				if(imageMagickOnly){
					imParams.push("-quality", quality + "%");
					imParams.push("-strip");
				}else{
					imParams.push("-quality", "100%");
				}

				if(sizing){
					imParams.push("-resize", sizing);
				}

				imParams.push(originalPath, tempFile);
				
				log.info(imConvertExe, imParams.join(" "));
				execFile(imConvertExe, imParams, {cwd:imageRoot}, function(err, stdout, stderr){
					if(err){cb(err); log.error(imConvertExe + " " + imParams.join(" "), err); return;}

					if(imageMagickOnly){
						finalizeTempFiles();
					}else{
						var cjpegParams=["-optimize", "-quality", quality, "-outfile", tempFile2, tempFile];
						
						log.info(cjpeg, cjpegParams);
						execFile(cjpeg, cjpegParams, {cwd:imageRoot}, function(err, stdout, stderr){
							if(err){cb(err); log.error(cjpeg + " " + cjpegParams.join(" "), err); return;}

							jpegtranParams = ["-optimize", "-progressive", "-copy", "none", "-outfile", tempFile, tempFile2];
							execFile(jpegtran, jpegtranParams, {cwd:imageRoot}, function(err, stdout, stderr){
								if(err){cb(err); log.error(jpegtran + " " + jpegtranParams.join(" "), err); return;}
								finalizeTempFiles();
							});
						});
					}
				});


				//////////////////////////////////////////////////
				function finalizeTempFiles(){
					fs.rename(tempFile, optimizedPath, function(err){
						if(err){cb(err);return;}
						fs.utimes(optimizedPath, originalMtime, originalMtime);  
						cb();
					});

					if(tempFile2){
						fs.unlink(tempFile2);
					}
				}
			}




			fs.stat(originalPath, function(err,stats){
				if(err){cb(err); return;}

				var originalMtime = Math.floor(stats.mtime.getTime()/1000);
				fs.stat(optimizedPath, function(err,stats){
					var optimizedMtime = stats?Math.floor(stats.mtime.getTime()/1000):null;
					if(optimizedMtime!==originalMtime){
						execOptimization(originalPath, originalMtime);
					}else{
						cb();
					}
				});

			});
		}

		/********************************************************************************************/
		function ensureOriginalIsValid(cb){

		    fs.exists(originalPath, function (exists) {
				if(exists){
					fs.stat(lastModifiedPath, function(err,stats){
						var lastValidateAge=options.revalidateAge;
						if(stats){
							var now=(new Date()).getTime();
							var lastValidated=stats.mtime.getTime();
							lastValidateAge = (now - lastValidated)/1000;
						}

						if(err || lastValidateAge >= options.revalidateAge){
							if(err){log.error("Can't stat: " , lastModifiedPath, err);}
							fs.readFile(lastModifiedPath, function (err, data) {
								log.info("Re-checking, since more than " + options.revalidateAge + " seconds since last check.");
								downloadOriginal(cb, err?null:{"if-modified-since": data});
							});
						}else{
							cb();					
						}
					});
				}else{
					downloadOriginal(cb);				
				}
			});

		}

		/********************************************************************************************/
		function downloadOriginal(cb, headers, failoverMode){

				var origRendition = slingImg;

				if(slingImg.match(/\/content\/dam\//)){
				 	origRendition = origRendition + "/jcr:content/renditions/original";
				}

				var slingStream;

				if(!failoverMode){
					log.info("Reading sling image: " + sc.baseUri + origRendition);
					slingStream= sc.getStream(origRendition, "GET", headers);
				}else{
					log.info("Reading sling image from failover: " + options.publicBaseUri + origRendition);
					slingStream = request({
						method: "GET",
						uri: options.publicBaseUri + origRendition,
						headers: headers,
						timeout: 5000,
						followRedirect: false
					});
				}
			    var originalTemp = getTempFile();
			    var statusCode;

				var ws=fs.createWriteStream(originalTemp);
				var lastModDate=new Date();

				slingStream.on("response", function(slingResponse){
						var lastModified=slingResponse.headers['last-modified'];
						if(lastModified){
							lastModDate=new Date(lastModified);
						}
						statusCode=slingResponse.statusCode;

						if(slingResponse.statusCode===200){
							mkdirp(imageRoot, function (err) {
							    if (err){cb(err); return;}

								fs.writeFile(lastModifiedPath, lastModified, function(){
									touchLastModifiedRecord();	
								}); // Keep record of sling's "Last-Modified" declaration, to validate later requests
								
							});
						}else
							if(slingResponse.statusCode===304){
								touchLastModifiedRecord();
								cb();
							}else{
								if(options.publicBaseUri && !failoverMode){
									log.warning("Failed to get image from initial sling-source, got: ", slingResponse.statusCode + " on: " + sc.baseUri + origRendition);
									downloadOriginal(cb, headers, true);
								}else{
										log.error("Failed to get image: ", sc.baseUri + origRendition);
										if(emailError){emailError({subject: "Blacklight img-opt: Sling download error", text: "Status " + slingResponse.statusCode + " on: " + sc.baseUri + origRendition, req: req});}
										res.status(500).send("Error " + slingResponse.statusCode + ": Problem getting image");
								}
							}							
						});

				slingStream.on("error",function(err){
					if(headers["if-modified-since"]){
						cb();
					}else{
						res.status(500).send("Error getting image: " + JSON.stringify(err));
					}
				});

				slingStream.pipe(ws);
				
				ws.on("finish", function(){
					if(statusCode===200){
						fs.unlink(originalPath, function (err) {										
							fs.rename(originalTemp, originalPath, function (err) {
								if (err){cb(err); return;}
								fs.utimes(originalPath, lastModDate, lastModDate, function(err){
									if(err) log.error("Could not set atime/mtime of: " + originalPath, err);
									cb();
								});
							});
						});
					}else{
						fs.unlink(originalTemp,function(err){if(err){log.error(err);} });
					}						
				});
					

			}
		
			/**************************************************************/
			function touchLastModifiedRecord(){								
				var now=new Date();
				fs.utimes(lastModifiedPath, now, now, function(err){if(err){log.error("IGNORING ERROR: setting mtime on lastModifiedPath: " + lastModifiedPath); log.error("Problem touching last mod",err);} });
			}

		};


		/**********************************************************************************/
		function validateExecutableConfiguration(options){
			_.each(["imagemagick-convert","cjpeg","jpegtran"], function(item, idx){
				var path=options[item], skipThisOne=false;

				if(!path){
					if(idx===0){
						throw new Error("img-opt: Configuration file must specify path to imageOptimizer." + item);
					}else{
						skipThisOne=true;
						imageMagickOnly=true;
					}
				}

				if(!skipThisOne){
					fs.exists(path,function(exists){
						if(!exists){
							var msg=[];
							msg.push("Bad configuration value for 'imageOptimizer." + item + "'");
							msg.push("No executable found at specified path: " + path);
							msg.push("Please install this utility and fix 'local.json' configuration to point to it, then try again.");
							var helper=installHelp[item];
							if(helper){
								msg.push("-------");
								if(helper.instructions){msg.push(helper.instructions + "\n");}
								if(helper.url){msg.push("More info at: " + helper.url);}
							}
							throw new Error(msg.join("\n") + "\n\n");
						}
					});
				}
			});

		}
	




};
