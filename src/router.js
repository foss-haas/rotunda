/* @flow */
'use strict';
type RouteFn = (params: {[key: string]: any}) => (Promise | any);
type ParamFn = (value: any, params: ?{[name: string]: Promise}) => (Promise | any);
type Schema = {validate: (value: any) => {value: any, error: ?Error}};
type Param = {resolve?: ParamFn, schema?: Schema};
type Route = {name?: string, resolve: RouteFn, paramNames: Array<string>, path: Array<string>};

class RouteNode {
  terminal: Array<Route>;
  _dynamic: ?RouteNode;
  _map: Map<string, RouteNode>;
  constructor() {
    this.terminal = [];
    this._dynamic = null;
    this._map = new Map();
  }
  dynamic(): RouteNode {
    var node: RouteNode = this._dynamic || new RouteNode();
    if (!this._dynamic) this._dynamic = node;
    return node;
  }
  hasDynamic(): boolean {
    return Boolean(this._dynamic);
  }
  get(key: string): RouteNode {
    return this._map.get(key);
  }
  has(key: string): boolean {
    return this._map.has(key);
  }
  set(key: string, node: RouteNode): void {
    this._map.set(key, node);
  }
}

export default class Router {
  _caseInsensitive: boolean;
  _params: Map<string, Param>;
  _byName: Map<string, Route>;
  _root: RouteNode;
  constructor(caseInsensitive: boolean = false) {
    this._caseInsensitive = caseInsensitive;
    this._params = new Map();
    this._byName = new Map();
    this._root = new RouteNode();
  }
  param(name: string, resolve: any, schema: any): Router {
    if (resolve) {
      if (schema) this._params.set(name, {resolve, schema});
      else this._params.set(name, resolve.validate ? {schema: resolve} : {resolve});
    } else if (schema) this._params.set(name, {schema});
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
        throw new Error(`Failed to reverse route ${name}. Missing param: ${token}`);
      }
      return token;
    }).join('/');
  }
  resolve(path: string, context: any): Promise {
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

    function next(err: any): Promise {
      if (err) return Promise.reject(err);
      if (!matches.length) return Promise.reject(404);
      var promisedParams: {[t: string]: Promise} = {};
      var resolvedParams: {[t: string]: any} = {$raw: {}};
      var {paramValues, route} = matches.shift();

      function promiseParam(value: any, i: number): Promise {
          var name = route.paramNames[i];
          var promise = resolveParam(value, name)
          .then(value => {
            resolvedParams[name] = value;
          });
          promisedParams[name] = promise;
          return promise;
      }

      function resolveParam(value: any, name: string): Promise {
        resolvedParams.$raw[name] = value;
        if (!paramDefs.has(name)) return Promise.resolve(value);
        var param: Param = paramDefs.get(name);
        if (param.schema) {
          var result = param.schema.validate(value);
          if (result.error) return Promise.reject();
          value = result.value;
        }
        return Promise.resolve(value)
        .then(v => param.resolve ? param.resolve(v, promisedParams, context) : v);
      }

      return Promise.all(paramValues.map(promiseParam))
      .then(() => route.resolve(resolvedParams, context))
      .then(undefined, err => (!err || err.ignore) ? next() : next(err));
    }

    traverse(this._root);

    return next();
  }
}
