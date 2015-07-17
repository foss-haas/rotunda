/* @flow */
/*global describe, it */
'use strict';
require('core-js/shim');
import Router from '../src/router';
import expect from 'expect.js';

type DoneFn = (err: ?Error) => void;
declare function it(msg: string, doFn: ?(done: DoneFn) => void): void;
declare function describe(msg: string, doFn: ?(done: DoneFn) => void): void;

describe('Router.resolve', () => {
  describe('routes', () => {
    it('fail hard when rejected with reasons', done => {
      new Router()
      .route('/x', () => Promise.reject(500))
      .route('/:y', () => done(new Error('Route should not match.')))
      .resolve('/x')
      .then(
        () => Promise.reject(new Error('Route should not resolve.')),
        err => {
          expect(err).to.be(500);
          done();
        }
      )
      .then(undefined, done);
    });
    it('fail over when rejected without reasons', done => {
      new Router()
      .route('/x', () => Promise.reject())
      .route('/:y', () => 'done')
      .resolve('/x')
      .then(value => {
        expect(value).to.be('done');
        done();
      })
      .then(undefined, done);
    });
  });
  describe('params', () => {
    it('fail hard when rejected with reasons', done => {
      new Router()
      .param('x', () => Promise.reject(500))
      .route('/:x', () => done(new Error('Route should not match.')))
      .route('/:y', () => done(new Error('Route should not match.')))
      .resolve('/x')
      .then(
        () => Promise.reject(new Error('Route should not resolve.')),
        err => {
          expect(err).to.be(500);
          done();
        }
      )
      .then(undefined, done);
    });
    it('fail over when rejected without reasons', done => {
      new Router()
      .param('x', () => Promise.reject())
      .route('/:x', () => done(new Error('Route should not match.')))
      .route('/:y', () => 'done')
      .resolve('/x')
      .then(value => {
        expect(value).to.be('done');
        done();
      })
      .then(undefined, done);
    });
  });
  it('stops resolving when it has a match', done => {
    new Router()
    .route('/stuff', () => 'done')
    .route('/stuff', () => Promise.reject(new Error('Route should not match.')))
    .resolve('/stuff')
    .then(value => {
      expect(value).to.be('done');
      done();
    })
    .then(undefined, done);
  })
  it('prefers static routes over dynamic routes', done => {
    var routes: Array<number> = [];
    new Router()
    .route('/:a/:b/:c', () => {
      routes.push(5);
      return Promise.reject();
    })
    .route('/stuff/goes', () => Promise.reject('Route should not match.'))
    .route('/stuff/goes/here/not', () => Promise.reject('Route should not match.'))
    .route('/stuff/goes/here/:nil', () => Promise.reject('Route should not match.'))
    .route('/stuff/goes/:c', () => {
      routes.push(2);
      return Promise.reject();
    })
    .route('/stuff/:b/here', () => {
      routes.push(3);
      return Promise.reject();
    })
    .route('/stuff/:b/:c', () => {
      routes.push(4);
      return Promise.reject();
    })
    .route('/stuff/goes/here', () => {
      routes.push(1);
      return Promise.reject();
    })
    .route('/:x/:y/:z', () => {
      routes.push(6);
      return Promise.reject();
    })
    .resolve('/stuff/goes/here')
    .then(
      () => Promise.reject(new Error('Route should not resolve.')),
      err => {
        expect(err).to.be(404);
        expect(routes).to.eql([1, 2, 3, 4, 5, 6]);
        done();
      }
    )
    .then(undefined, done);
  });
});

describe('Router.reverse', () => {
  it('returns a path for a named route without parameters', () => {
    var router = new Router().route('/x', function () {}, 'example');
    expect(router.reverse('example')).to.equal('/x');
  });
  it('returns a path for a named route with parameters', () => {
    var router = new Router().route('/x/:y', function () {}, 'example');
    expect(router.reverse('example', {y: 'hi'})).to.equal('/x/hi');
  });
  it('converts parameter values to strings', () => {
    var obj = {toString: () => 'banana'}
    var router = new Router().route('/:x/:y', function () {}, 'example');
    expect(router.reverse('example', {x: 23, y: obj})).to.equal('/23/banana');
  });
  it('fails if the name is not known', () => {
    var router = new Router();
    expect(() => router.reverse('example')).to.throwException();
  });
  it('fails if any parameters are missing', () => {
    var router = new Router().route('/x/:y', function () {}, 'example');
    expect(() => router.reverse('example')).to.throwException();
  });
  it('ignores parameters for routes without parameters', () => {
    var router = new Router().route('/x', function () {}, 'example');
    expect(router.reverse('example', {a: 'b'})).to.equal('/x');
  });
  it('ignores superfluous parameters for routes with parameters', () => {
    var router = new Router().route('/x/:y', function () {}, 'example');
    expect(router.reverse('example', {a: 'b', y: 'hi'})).to.equal('/x/hi');
  });
});
