'use strict';
type nextFn = (err: ?Error) => Promise;
type routeFn = (params: Object, next: nextFn) => Promise;
type paramFn = (value: any, params?: Object) => Promise;
type joiSchema = {validate: (value: any) => {value: any, error: ?Error}};

export class Router {
  constructor(caseInsensitive = false: boolean) {
    this._caseInsensitive = caseInsensitive;
    this._params = new Map();
    this._named = new Map();
    this._routes = {};
  }
  param(name: string, resolve: ?(paramFn | joiSchema), schema: ?joiSchema): Router {
    if (resolve) {
      if (!schema && resolve.validate) {
        schema = resolve;
        resolve = undefined;
      }
      this._params.set(name, {resolve, schema});
    }
    return this;
  }
  route(path: string, resolve: routeFn, name: ?string): Router {
    let tokens = path.split('/').filter(Boolean);
    let routes = this._routes;
    let params = [];
    let route = {resolve, name, params, path: tokens};
    tokens.forEach(token => {
      if (this._caseInsensitive) token = token.toLowerCase();
      if (token.charAt(0) === ':') {
        params.push(token.slice(1));
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
  reverse(name: string, params: ?Object): string {
    let route = this._named.get(name);
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
    let caseInsensitive = this._caseInsensitive;
    let paramDefs = this._params;
    let tokens = path.split('/').filter(Boolean);
    let matches = [];

    traverse(this._routes);

    return next();

    function traverse(route, i = 0: number, params = []: Array<string>) {
      if (i === tokens.length) {
        if (!route['$']) return;
        route['$'].forEach(r => matches.push({route: r, params}));
        return;
      }
      let token = tokens[i];
      if (caseInsensitive) token = token.toLowerCase();
      if (route[`=${token}`]) traverse(route[`=${token}`], i + 1, params);
      if (route[':']) traverse(route[':'], i + 1, params.concat(token));
    }

    function next(err) {
      if (err) return Promise.reject(err);
      if (!matches.length) return Promise.reject(404);

      let {
        params: paramValues,
        route: {
          resolve: resolveRoute,
          params: paramNames
        }
      } = matches.shift();

      let promises = {};
      let values = {};

      paramValues = paramValues.map((value, i) => {
        let name = paramNames[i];
        if (!paramDefs.has(name)) return Promise.resolve(value);

        let {
          resolve: resolveParam,
          schema
        } = paramDefs.get(name);

        if (schema) {
          let result = schema.validate(value);
          if (result.error) return Promise.reject(result.error);
          value = result.value;
        }

        return Promise.resolve(value)
        .then(v => resolveParam ? resolveParam(v, promises) : v);
      });

      return Promise.all(paramValues)
      .then(values => {
        let params = {};
        values.forEach((value, i) => {
          let name = paramNames[i];
          params[name] = value;
        });
        return resolveRoute(values);
      })
      .then(null, err => (!err || err.ignore) ? next() : next(err));
    }
  }
}