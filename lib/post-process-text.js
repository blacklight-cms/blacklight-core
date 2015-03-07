
var beautify=require("js-beautify").html;



/**
 * Creates a text post-processor, which conditionally applies text post-processors based on selector, extension and HTTP method type
 * @returns {module:component-types~ComponentTypeRegistry} 
 * @param {Object} options - Configuration options
 * @param {boolean} options.beautifyHTML
 */

module.exports=function(processors, options){
	processors=processors||[];

	processors.push(function fixRaw(text,req){
		if(req.extension=="raw"){
			return "<html><head><title>Raw data visualization</title></head><body>\n" + text + "\n</body></html>";
		}
	})

	if(options.beautifyHTML){
		processors.push(function beautifyHTML(text, req){
			if(req.extension=="html" || req.extension=="raw"){
				return beautify(text,{indent_size:3})
			}
		} );
	}

	///////////////////////////////////////////////////////////////
	return function processText(text, req){
		processors.forEach(function(process){
			try{
				var altered = process(text, req);
				if(altered)
					text=altered;
			}catch(err){
				err.details="Error in text post-processor";
				throw(err);
			}
		} );

		return text;
	}
}