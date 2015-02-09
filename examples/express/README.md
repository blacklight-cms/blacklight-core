Blacklight Express example
==========================

This example demonstrates an extremely simple Express configuration which makes use of the Blacklight CMS middleware.  It assumes that there is a Sling endpoint running on the localhost at port 4502, with user 'admin' and password 'admin';  change these values to match your environment prior to running the example.

Usage:

	node express.js

[Open the local web service](http://127.0.0.1:3000/) in your web browser, and change the URL in the address bar to correspond with a page that exists in the Sling repository to which you are attached.  For example [/content/my-site/en/](http://127.0.0.1:3000/content/my-site/en/).  You'll see the page rendered using Blacklight's default template, which simply displays the raw data, highlighting detected components in alternating colors.

To customize the page rendering, choose a component listed in the HTML data in your brwoser.  The component names are highlighted in yellow at the top of each component square. Then create a folder named for your selected component under `express/components`.  For example, create `express/components/mycompany/content/header`.  Then inside that new folder, create a template file called `header.hbs`.  This file will use the [Handlebars](http://handlebarsjs.com/) templating language.

To customize the data being fed into your `header` component's template, you would create a file called `header.js`.  Because of the `.js` extension, the file is treated as a model processing directive.  The file will be treated as a module, and the module should export a function called `process` which accepts the unaltered model as its first parameter.  For example to change the title to all upper case before feeding it to the template:

	exports.process=function(model, utils){
		model.title = model.title.toUpperCase();
	}

If the process needs to be asynchronous, set `exports.async=true` and then be sure to call `utils.resolve()` to indicate to Blacklight that the background processing is complete.  For example:

	exports.async=true;

	exports.process=function(model, utils){
		setTimeout(function(){
				model.title = model.title.toUpperCase();
				utils.resolve()
			}, 1000);
	}