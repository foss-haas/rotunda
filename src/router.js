/* @flow */
'use strict';
type NextFn = (err: ?Error) => Promise;
type RouteFn = (params: {[key: string]: any}) => (Promise | any);
type ParamFn = (value: any, params: ?{[name: string]: Promise}) => (Promise | any);
type Schema = {validate: (value: any) => {value: any, error: ?Error}};
type Param = {resolve: ?ParamFn, schema: ?Schema};
type Route = {name: ?string, resolve: RouteFn, paramNames: Array<string>, path: Array<string>};
type RouteNode = {[token: string]: (RouteNode | Array<Route>)};

export class Router {
  _caseInsensitive: boolean;
  _params: Map<string,Param>;
  _named: Map<string,Route>;
  _routes: RouteNode;
  constructor(caseInsensitive: boolean = false) {
    this._caseInsensitive = caseInsensitive;
    this._params = new Map();
    this._named = new Map();
    this._routes = {};
  }
  param(name: string, resolve: ?(ParamFn | Schema), schema: ?Schema): Router {
    if (resolve) {
      if (!schema && resolve.validate) {
        schema = resolve;
        resolve = undefined;
      }
      this._params.set(name, {resolve, schema});
    }
    return this;
  }
  route(path: string, resolve: RouteFn, name: ?string): Router {
    var tokens = path.split('/').filter(Boolean);
    var routes = this._routes;
    var paramNames: Array<string> = [];
    var route: Route = {name, resolve, paramNames, path: tokens};
    tokens.forEach(token => {
      if (this._caseInsensitive) token = token.toLowerCase();
      if (token.charAt(0) === ':') {
        paramNames.push(token.slice(1));
        token = ':';
      } else token = `=${token}`;
      if (!routes[token]) routes[token] = {};
      routes = routes[token];
    });
    if (!routes['$']) routes['$'] = [];
    routes['$'].push(route);
    if (name) this._named.set(name, route);
    return this;
  }
  reverse(name: string, params: ?{[name: string]: any}): string {
    var route = this._named.get(name);
    if (!route) throw new Error(`Unknown route: ${name}`);
    return '/' + route.path.map(token => {
      if (token.charAt(0) === ':') {
        token = token.slice(1);
        if (params && params[token]) return params[token];
        throw new Error(`Failed to resolve route ${name}. Missing param: ${token}`);
      }
      return token;
    }).join('/');
  }
  resolve(path: string): Promise {
    var caseInsensitive = this._caseInsensitive;
    var paramDefs = this._params;
    var tokens = path.split('/').filter(Boolean);
    var matches: Array<{route: Route, params: Array<string>}> = [];

    function traverse(route: RouteNode, i: number = 0, params: Array<string> = []) {
      if (i === tokens.length) {
        if (!route['$']) return;
        route['$'].forEach(r => matches.push({route: r, params}));
        return;
      }
      var token = tokens[i];
      if (caseInsensitive) token = token.toLowerCase();
      if (route[`=${token}`]) traverse(route[`=${token}`], i + 1, params);
      if (route[':']) traverse(route[':'], i + 1, params.concat(token));
    }

    function next(err) {
      if (err) return Promise.reject(err);
      if (!matches.length) return Promise.reject(404);

      var promisedParams = {};
      var resolvedParams = {};
      var {
        params: paramValues,
        route: {
          resolve: resolveRoute,
          paramNames
        }
      } = matches.shift();

      var paramPromises = paramValues.map((value, i) => {
        var name = paramNames[i];
        var promise = promisedParam(value, name)
        .then(value => {
          resolvedParams[name] = value;
        });
        promisedParams[name] = promise;
        return promise;
      });

      function promisedParam(value, name) {
        if (!paramDefs.has(name)) return Promise.resolve(value);
        var {
          resolve: resolveParam,
          schema
        } = paramDefs.get(name);

        if (schema) {
          var result = schema.validate(value);
          if (result.error) return Promise.reject(result.error);
          value = result.value;
        }

        return Promise.resolve(value)
        .then(v => resolveParam ? resolveParam(v, promisedParams) : v);
      }

      return Promise.all(paramPromises)
      .then(() => resolveRoute(resolvedParams))
      .then(undefined, err => (!err || err.ignore) ? next() : next(err));
    }

    traverse(this._routes);

    return next();
  }
}
