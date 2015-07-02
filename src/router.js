/* @flow */
'use strict';
type NextFn = (err: ?Error) => Promise;
type RouteFn = (params: {[key: string]: any}) => (Promise | any);
type ParamFn = (value: any, params: ?{[name: string]: Promise}) => (Promise | any);
type Schema = {validate: (value: any) => {value: any, error: ?Error}};
type Param = {resolve?: ParamFn, schema?: Schema};
type Route = {name?: string, resolve: RouteFn, paramNames: Array<string>, path: Array<string>};

class RouteNode extends Map<string, RouteNode> {
  terminal: Array<Route>;
  _dynamic: ?RouteNode;
  constructor() {
    super();
    this.terminal = [];
    this._dynamic = null;
  }
  dynamic(): RouteNode {
    var node: RouteNode = this._dynamic || new RouteNode();
    if (!this._dynamic) this._dynamic = node;
    return node;
  }
  hasDynamic(): boolean {
    return Boolean(this._dynamic);
  }
}

export class Router {
  _caseInsensitive: boolean;
  _params: Map<string,Param>;
  _byName: Map<string,Route>;
  _root: RouteNode;
  constructor(caseInsensitive: boolean = false) {
    this._caseInsensitive = caseInsensitive;
    this._params = new Map();
    this._byName = new Map();
    this._root = new RouteNode();
  }
  param(name: string, resolve: any, schema: any): Router {
    if (resolve) {
      if (resolve.validate) {
        schema = resolve;
        resolve = undefined;
      }
      this._params.set(name, {resolve, schema})
    }
    return this;
  }
  route(path: string, resolve: RouteFn, name?: string): Router {
    var tokens: Array<string> = path.split('/').filter(Boolean);
    var node: RouteNode = this._root;
    var paramNames: Array<string> = [];
    var route: Route = {name, resolve, paramNames, path: tokens};
    tokens.forEach(token => {
      if (this._caseInsensitive) token = token.toLowerCase();
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
  reverse(name: string, params: ?{[name: string]: any}): string {
    var route: ?Route = this._byName.get(name);
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
    var caseInsensitive: boolean = this._caseInsensitive;
    var paramDefs = this._params;
    var tokens: Array<string> = path.split('/').filter(Boolean);
    var matches: Array<{route: Route, paramValues: Array<string>}> = [];

    function traverse(route: RouteNode, i: number = 0, paramValues: Array<string> = []) {
      if (i === tokens.length) {
        if (!route.terminal) return;
        route.terminal.forEach(r => matches.push({route: r, paramValues}));
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
      var promisedParams: {[t: string]: Promise} = {};
      var resolvedParams: {[t: string]: any} = {};
      var {paramValues, route} = matches.shift();

      function paramValueToPromise(value: any, i: number): Promise {
          var name = route.paramNames[i];
          var promise = promisedParam(value, name)
          .then(value => {
            resolvedParams[name] = value;
          });
          promisedParams[name] = promise;
          return promise;
      }

      function promisedParam(value: any, name: string): Promise {
        if (!paramDefs.has(name)) return Promise.resolve(value);
        var param = paramDefs.get(name);
        if (param.schema) {
          var result = param.schema.validate(value);
          if (result.error) return Promise.reject(result.error);
          value = result.value;
        }
        return Promise.resolve(value)
        .then(v => param.resolve ? param.resolve(v, promisedParams) : v);
      }

      return Promise.all(paramValues.map(paramValueToPromise))
      .then(() => route.resolve(resolvedParams))
      .then(undefined, err => (!err || err.ignore) ? next() : next(err));
    }

    traverse(this._root);

    return next();
  }
}
