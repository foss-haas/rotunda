![Rotunda](http://foss-haas.github.io/rotunda/rotunda-dark.png)

**Rotunda** is a modern promise-based isomorphic routing library for Node.js and the browser inspired by the [express framework](http://expressjs.com) and [Django](https://www.djangoproject.com).

[![license - MIT](https://img.shields.io/npm/l/rotunda.svg)](http://foss-haas.mit-license.org) [![Dependencies](https://img.shields.io/david/foss-haas/rotunda.svg)](https://david-dm.org/foss-haas/rotunda)

[![NPM status](https://nodei.co/npm/rotunda.png?compact=true)](https://www.npmjs.com/package/rotunda)

[![Build status](https://img.shields.io/travis/foss-haas/rotunda.svg)](https://travis-ci.org/foss-haas/rotunda) [![Coverage status](https://img.shields.io/coveralls/foss-haas/rotunda.svg)](https://coveralls.io/r/foss-haas/rotunda?branch=master)

# Install

**Note:** Rotunda uses language features that were introduced in ES2015 (ES6). The code has been converted to ES5 syntax using [Babel](http://babeljs.io) but expects certain globals like `Promise` and `Map` that may not be available in older JavaScript environments. If you plan to use Rotunda in older browsers or older versions of Node.js you should use a polyfill/shim library like [core-js](https://www.npmjs.com/package/core-js).

## With NPM

```sh
npm install rotunda
```

## From source

```sh
git clone https://github.com/foss-haas/rotunda.git
cd rotunda
npm install
npm run dist
```

In order to run the automated type checks for development, you will need to have [flow](http://flowtype.org) installed and available from the project folder. If flow is not available, the type checks will be skipped temporarily.

# API

## new Router

Creates a `Router` instance.

**Arguments**

* caseInsensitive: *boolean* (default: `false`)

  If enabled, routes and paths will be converted to lower case, emulating the behaviour of case-insensitive file systems. Parameter names are not affected and are always case-sensitive.

**Examples**

```js
import Router from 'rotunda';
let router = new Router();
let caselessRouter = new Router(true);

// ES5 equivalent:

var Router = require('rotunda').Router;
var router = new Router();
var caselessRouter = new Router(true);
```

## Router#param

Defines a named parameter on the router. Returns the router instance itself to allow chaining.

**Arguments**

* **name**: *string*

  The parameter will be invoked by every route that matches its name. Parameter names are case-sensitive. If a route uses a parameter that was not defined, the value will be passed through to the route handler directly.

* **resolve**: *function* (optional)

  Optionally the parameter can be assigned a resolve function that should return a promise for the parameter's value. The function will be passed the current value of the parameter as well as an object mapping the names of other parameters for the route to promises for their values.

  If the promise is rejected with a reason, the routing will be aborted and fail with the given reason. If the promise is rejected *without* a reason, the route will fail to match and the routing will continue with the next match or fail with an error indicating that the route could not be resolved if there are no other matches.

  Otherwise the result the result of the promise will be passed to any parameters that depend on it. Once all parameters have resolved successfully, their values will be passed to the route handler matching the route.

  **Note that it is possible to create a dead-lock if two parameters on the same route depend on each other's values to resolve.**

* **schema**: *any* (optional)

  Optionally the parameter can be assigned a schema to validate any matching values against. The schema can be a [joi schema](https://github.com/hapijs/joi) or any value that has a method named `validate`. The method must accept a string value as input and return an object with two properties: `value` and `error`.

  A truthy `error` indicates that the schema validation has failed and will result in the router skipping the matched route and continuing with the next match or failing with an error indicating the route could not be resolved.

  If the value of `error` is non-truthy, the value of the `value` property will be used as the value of the parameter for the resolve function or the current route handler if the parameter has no resolve function.


If you only want to assign a schema to the parameter, you can pass the schema as the second argument.

If neither *resolve* nor *schema* are specified, the method has no effect.

If both are defined, the value will first be validated against the schema and then passed to the resolve function.

**Examples**

```js
// Let's use joi for our schemas
import joi from 'joi';

// Define a parameter that resolves immediately
router.param('primeNumber', function (value) {
  // Joi has validated the value and converted it to a number
  // So we can just pass it to other code that expects a number
  if (isPrimeNumber(value)) return value;
  // Not a prime, probably the wrong route
  // Reject without reason to try the next route instead
  return Promise.reject();
}, joi.number().integer());

// Define a parameter that resolves asynchronously
router.param('articleId', function (value) {
  // Let's make some kind of remote API call over AJAX with the validated ID
  return ajax.get(`/api/articles/${value}`);
}, joi.number().integer());

// Define a parameter that depends on another parameter
router.param('userArticleId', function (value, params) {
  return params.userId
  .then(function (validUserId) {
    // We have waited for the "userId" parameter to be resolved
    // Now let's do something that returns a promise
    return ajax.get(`/api/users/${validUserId}/articles/${value}`);
  });
}, joi.number().integer());

// Define a parameter with only a resolve function
router.param('magic', function (value) {
  return ajax.post('/api/magic', {magic: value})
  .then(
    function (magic) {
      return magic * 2;
    },
    function (apiError) {
      // Reject with a reason to abort the routing
      return Promise.reject({
        error: 'Out of magic!',
        reason: apiError
      });
    }
  )
});

// Define a parameter with only a schema
router.param('someNumber', joi.number());

// This has no effect
router.param('nothing');
```

## Router#route

Defines a route on the router. Returns the router instance itself to allow chaining.

**Arguments**

* **route**: *string*

  The absolute path of the route to define. Leading, trailing and redundant slashes will be ignored. Parameters are segments starting with a colon followed by the parameter name, e.g. `/users/:userId/profile` contains the parameter "userId".

  If any of the parameters have been defined on the router, their values will be validated and resolved before being passed to the handler. If any parameter fails to validate or resolve, the route handler will be skipped.

  Note that for any segment of the route any static matches will be preferred to parameters, e.g. for the path `/pages/manual` the route `/pages/:pageName` (static, parameter) will be preferred over the route `/:category/manual` (parameter, static) which in turn will be preferred over `/:category/:section` (parameter, parameter).

* **handler**: *function*

  A function that returns a promise for the result of the given route. If the route contains any parameters, the handler will be passed an object mapping the names of the parameters to their resolved values.

  If the promise returned by the handler is rejected with an error, the routing will abort and fail with that error. If the promise is rejected without an error, the next route handler matching the route will be invoked. If no other handlers match the route, the routing will fail with an error indicating that the route could not be resolved.

  If the handler returns any other value than a promise, it will be wrapped in a resolved promise automatically.

* **name**: *string* (optional)

  The route can optionally be registered using a given name. Only named routes can be reversed (see below).

**Examples**

```js
router.route('/users/:userId', function (params) {
  return Promise.resolve(`This is the user page for the User #${params.userId}!`);
});

// Non-promise return values will be wrapped automatically
router.route('/articles/:articleId', function (params) {
  return `This is the article page for Article #${params.userId}!`;
});

// Parameters will have been resolved before the route handler is invoked
router.param('comment', function (value) {
  return ajax.get(`/api/comments/${value}`);
}, joi.number().integer().required());
router.route('/articles/:articleId/comments/:comment', function (params) {
  return Promise.resolve(`Comment: ${params.comment.title} by ${params.comment.author}`);
});
```

## Router#reverse

Returns a path that would resolve to the route name and parameters.

**Arguments**

* **name**: *string*

  The name of a named route registered with this router. If no route with the given name has been registered with the router, an error will be thrown.

* **parameters**: *Object* (optional)

  An object mapping parameter names to parameter values. Any parameters not used by the route will be ignored. If any parameters are missing, an error will be thrown.

  Parameter values should be strings or values with string representations that are supported by the parameter definitions.

**Examples**

```js
router.param('articleId', joi.number().integer());
router.route('/articles/:articleId', function () {/*...*/}, 'article_detail');

// You can always pass in parameter values as strings
router.reverse('article_detail', {articleId: '23'});
// -> "/articles/23"

// You can also pass in non-string values
router.reverse('article_detail', {articleId: 42});
// -> "/articles/42"

// But be wary of passing in arbitrary objects
router.reverse('article_detail', {articleId: {some: 'object'}});
// -> "/articles/[object Object]"

// You always have to pass in all parameters
router.reverse('article_detail', {articleId: '23'});
// -> Error: Failed to reverse article_detail. Missing param: articleId

// Extra parameters will be ignored
router.reverse('article_detail', {articleId: '23', size: 'xxl'});
// -> "/articles/23"
```

## Router#resolve

Attempts to resolve a path. Returns a promise that is rejected if the path does not successfully match any routes or resolved with the matching route handler's result.

**Arguments**

* **path**: *string*

  The absolute path to resolve.

**Examples**

```js
router.param('articleId', joi.number().integer());
router.route('/articles/:articleId', function (params) {
  return Promise.resolve(`This is the article page for Article #${params.userId}!`);
});

router.resolve('/articles/23').then(
  function (result) {console.log(result);},
  function (err) {console.error(err);}
);
// -> This is the article page for Article #23

// Paths that don't match anything are rejected
router.resolve('/articles/pants').then(
  function (result) {console.log(result);},
  function (err) {console.error(err);}
);
// -> Error: 404

// Paths that match a route that is rejected with a reason are rejected
router.route('/bad-route', function () {
  return Promise.reject(new Error('Out of order'));
});
router.resolve('/bad-route').then(
  function (result) {console.log(result);},
  function (err) {console.error(err);}
);
// -> Error: Out of order

// Parameters that are rejected with a reason also result in rejection
router.param('bad-param', function () {
  return Promise.reject(new Error('Server error'));
});
router.route('/some-route/bad-param', function () {/*never reached*/});
router.resolve('/some-route/bad-param').then(
  function (result) {console.log(result);},
  function (err) {console.error(err);}
);
// -> Error: Server error
```

# License

The MIT/Expat license. For more information, see http://foss-haas.mit-license.org/ or the accompanying [LICENSE](https://github.com/foss-haas/rotunda/blob/master/LICENSE) file.
