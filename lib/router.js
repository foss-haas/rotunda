/* @flow */
'use strict';
Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x4, _x5, _x6) { var _again = true; _function: while (_again) { var object = _x4, property = _x5, receiver = _x6; desc = parent = getter = undefined; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x4 = parent; _x5 = property; _x6 = receiver; _again = true; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; }

var RouteNode = (function (_Map) {
  function RouteNode() {
    _classCallCheck(this, RouteNode);

    _get(Object.getPrototypeOf(RouteNode.prototype), 'constructor', this).call(this);
    this.terminal = [];
    this._dynamic = null;
  }

  _inherits(RouteNode, _Map);

  _createClass(RouteNode, [{
    key: 'dynamic',
    value: function dynamic() {
      var node = this._dynamic || new RouteNode();
      if (!this._dynamic) this._dynamic = node;
      return node;
    }
  }, {
    key: 'hasDynamic',
    value: function hasDynamic() {
      return Boolean(this._dynamic);
    }
  }]);

  return RouteNode;
})(Map);

var Router = (function () {
  function Router() {
    var caseInsensitive = arguments[0] === undefined ? false : arguments[0];

    _classCallCheck(this, Router);

    this._caseInsensitive = caseInsensitive;
    this._params = new Map();
    this._byName = new Map();
    this._root = new RouteNode();
  }

  _createClass(Router, [{
    key: 'param',
    value: function param(name, resolve, schema) {
      this._params.set(name, resolve && resolve.validate ? { schema: resolve } : { schema: schema, resolve: resolve });
      return this;
    }
  }, {
    key: 'route',
    value: function route(path, resolve, name) {
      var _this = this;

      var tokens = path.split('/').filter(Boolean);
      var node = this._root;
      var paramNames = [];
      var route = { name: name, resolve: resolve, paramNames: paramNames, path: tokens };
      tokens.forEach(function (token) {
        if (_this._caseInsensitive) token = token.toLowerCase();
        if (token.charAt(0) === ':') {
          paramNames.push(token.slice(1));
          node = node.dynamic();
        } else {
          if (!node.has(token)) node.set(token, new RouteNode());
          node = node.get(token);
        }
      });
      node.terminal.push(route);
      if (name) this._byName.set(name, route);
      return this;
    }
  }, {
    key: 'reverse',
    value: function reverse(name, params) {
      var route = this._byName.get(name);
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
        var paramValues = arguments[2] === undefined ? [] : arguments[2];

        if (i === tokens.length) {
          if (!route.terminal) return;
          route.terminal.forEach(function (r) {
            return matches.push({ route: r, paramValues: paramValues });
          });
          return;
        }
        var token = tokens[i];
        if (caseInsensitive) token = token.toLowerCase();
        if (route.has(token)) traverse(route.get(token), i + 1, paramValues);
        if (route.hasDynamic()) traverse(route.dynamic(), i + 1, paramValues.concat(token));
      }

      function next(err) {
        if (err) return Promise.reject(err);
        if (!matches.length) return Promise.reject(404);
        var promisedParams = {};
        var resolvedParams = {};

        var _matches$shift = matches.shift();

        var paramValues = _matches$shift.paramValues;
        var route = _matches$shift.route;

        function promiseParam(value, i) {
          var name = route.paramNames[i];
          var promise = resolveParam(value, name).then(function (value) {
            resolvedParams[name] = value;
          });
          promisedParams[name] = promise;
          return promise;
        }

        function resolveParam(value, name) {
          if (!paramDefs.has(name)) return Promise.resolve(value);
          var param = paramDefs.get(name);
          if (param.schema) {
            var result = param.schema.validate(value);
            if (result.error) return Promise.reject();
            value = result.value;
          }
          return Promise.resolve(value).then(function (v) {
            return param.resolve ? param.resolve(v, promisedParams) : v;
          });
        }

        return Promise.all(paramValues.map(promiseParam)).then(function () {
          return route.resolve(resolvedParams);
        }).then(undefined, function (err) {
          return !err || err.ignore ? next() : next(err);
        });
      }

      traverse(this._root);

      return next();
    }
  }]);

  return Router;
})();

exports.Router = Router;