/* @flow */
'use strict';
Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var Router = (function () {
  function Router() {
    var caseInsensitive = arguments[0] === undefined ? false : arguments[0];

    _classCallCheck(this, Router);

    this._caseInsensitive = caseInsensitive;
    this._params = new Map();
    this._named = new Map();
    this._routes = { $: [] };
  }

  _createClass(Router, [{
    key: 'param',
    value: function param(name, resolve, schema) {
      if (resolve) {
        if (!schema && resolve.validate) {
          schema = resolve;
          resolve = undefined;
        }
        this._params.set(name, { resolve: resolve, schema: schema });
      }
      return this;
    }
  }, {
    key: 'route',
    value: function route(path, resolve, name) {
      var _this = this;

      var tokens = path.split('/').filter(Boolean);
      var routes = this._routes;
      var paramNames = [];
      var route = { name: name, resolve: resolve, paramNames: paramNames, path: tokens };
      tokens.forEach(function (token) {
        if (_this._caseInsensitive) token = token.toLowerCase();
        if (token.charAt(0) === ':') {
          paramNames.push(token.slice(1));
          token = ':';
        } else token = '=' + token;
        if (!routes[token]) routes[token] = { $: [] };
        routes = routes[token];
      });
      routes.$.push(route);
      if (name) this._named.set(name, route);
      return this;
    }
  }, {
    key: 'reverse',
    value: function reverse(name, params) {
      var route = this._named.get(name);
      if (!route) throw new Error('Unknown route: ' + name);
      return '/' + route.path.map(function (token) {
        if (token.charAt(0) === ':') {
          token = token.slice(1);
          if (params && params[token]) return params[token];
          throw new Error('Failed to resolve route ' + name + '. Missing param: ' + token);
        }
        return token;
      }).join('/');
    }
  }, {
    key: 'resolve',
    value: function resolve(path) {
      var caseInsensitive = this._caseInsensitive;
      var paramDefs = this._params;
      var tokens = path.split('/').filter(Boolean);
      var matches = [];

      function traverse(route) {
        var i = arguments[1] === undefined ? 0 : arguments[1];
        var params = arguments[2] === undefined ? [] : arguments[2];

        if (i === tokens.length) {
          if (!route.$) return;
          route.$.forEach(function (r) {
            return matches.push({ route: r, params: params });
          });
          return;
        }
        var token = tokens[i];
        if (caseInsensitive) token = token.toLowerCase();
        if (route['=' + token]) traverse(route['=' + token], i + 1, params);
        if (route[':']) traverse(route[':'], i + 1, params.concat(token));
      }

      function next(err) {
        if (err) return Promise.reject(err);
        if (!matches.length) return Promise.reject(404);

        var promisedParams = {};
        var resolvedParams = {};

        var _matches$shift = matches.shift();

        var paramValues = _matches$shift.params;
        var _matches$shift$route = _matches$shift.route;
        var resolveRoute = _matches$shift$route.resolve;
        var paramNames = _matches$shift$route.paramNames;

        var paramPromises = paramValues.map(function (value, i) {
          var name = paramNames[i];
          var promise = promisedParam(value, name).then(function (value) {
            resolvedParams[name] = value;
          });
          promisedParams[name] = promise;
          return promise;
        });

        function promisedParam(value, name) {
          if (!paramDefs.has(name)) return Promise.resolve(value);

          var _paramDefs$get = paramDefs.get(name);

          var resolveParam = _paramDefs$get.resolve;
          var schema = _paramDefs$get.schema;

          if (schema) {
            var result = schema.validate(value);
            if (result.error) return Promise.reject(result.error);
            value = result.value;
          }

          return Promise.resolve(value).then(function (v) {
            return resolveParam ? resolveParam(v, promisedParams) : v;
          });
        }

        return Promise.all(paramPromises).then(function () {
          return resolveRoute(resolvedParams);
        }).then(undefined, function (err) {
          return !err || err.ignore ? next() : next(err);
        });
      }

      traverse(this._routes);

      return next();
    }
  }]);

  return Router;
})();

exports.Router = Router;