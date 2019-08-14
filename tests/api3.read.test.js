/* global should */
'use strict';

require('should');

describe('API3 READ', function() {
  const self = this
    , testConst = require('./fixtures/api3/const.json')
    , instance = require('./fixtures/api3/instance')
    , authSubject = require('./fixtures/api3/authSubject')
    , opTools = require('../lib/api3/shared/operationTools')
    ;

  self.validDoc = {
    date: (new Date()).getTime(),
    app: testConst.TEST_APP,
    device: testConst.TEST_DEVICE,
    uploaderBattery: 58
  };
  self.validDoc.identifier = opTools.calculateIdentifier(self.validDoc);

  self.timeout(15000);


  before(done => {
    instance.create({})

      .then(instance => {
        self.instance = instance;
        self.app = instance.app;
        self.env = instance.env;

        self.url = '/api/v3/devicestatus';
        return authSubject(instance.ctx.authorization.storage);
      })
      .then(result => {
        self.subject = result.subject;
        self.token = result.token;
        done();
      })
      .catch(err => {
        done(err);
      })
  });


  after(() => {
    self.instance.server.close();
  });


  it('should require authentication', done => {
    self.instance.get(`${self.url}/FAKE_IDENTIFIER`)
      .expect(401)
      .end((err, res) => {
        should.not.exist(err);
        res.body.status.should.equal(401);
        res.body.message.should.equal('Missing or bad access token or JWT');
        done();
      });
  });


  it('should not found not existing collection', done => {
    self.instance.get(`/api/v3/NOT_EXIST/NOT_EXIST?token=${self.url}`)
      .send(self.validDoc)
      .expect(404)
      .end((err, res) => {
        should.not.exist(err);
        res.body.should.be.empty();
        done();
      });
  });


  it('should not found not existing document', done => {
    self.instance.get(`${self.url}/${self.validDoc.identifier}?token=${self.token.read}`)
      .expect(404)
      .end(done);
  });


  it('should read just created document', done => {
    self.instance.post(`${self.url}?token=${self.token.create}`)
      .send(self.validDoc)
      .expect(201)
      .end((err, res) => {
        should.not.exist(err);
        res.body.should.be.empty();

        self.instance.get(`${self.url}/${self.validDoc.identifier}?token=${self.token.read}`)
          .expect(200)
          .end((err, res) => {
            should.not.exist(err);

            res.body.should.containEql(self.validDoc);
            res.body.should.have.property('srvCreated').which.is.a.Number();
            res.body.should.have.property('srvModified').which.is.a.Number();
            res.body.should.have.property('subject');
            self.validDoc.subject = res.body.subject; // let's store subject for later tests

            done();
          })
      });
  });


  it('should contain only selected fields', done => {
    self.instance.get(`${self.url}/${self.validDoc.identifier}?fields=date,device,subject&token=${self.token.read}`)
      .expect(200)
      .end((err, res) => {
        should.not.exist(err);

        const correct = { 
          date: self.validDoc.date, 
          device: self.validDoc.device, 
          subject: self.validDoc.subject
        };
        res.body.should.eql(correct);

        done();
      })
  });


  it('should contain all fields', done => {
    self.instance.get(`${self.url}/${self.validDoc.identifier}?fields=_all&token=${self.token.read}`)
      .expect(200)
      .end((err, res) => {
        should.not.exist(err);

        for (const fieldName of ['app', 'date', 'device', 'identifier', 'srvModified', 'uploaderBattery', 'subject']) {
          res.body.should.have.property(fieldName);
        }

        done();
      })
  });


  it('should not send unmodified document since', done => {
    self.instance.get(`${self.url}/${self.validDoc.identifier}?token=${self.token.read}`)
      .set('If-Modified-Since', new Date(new Date().getTime() + 1000).toUTCString())
      .expect(304)
      .end((err, res) => {
        should.not.exist(err);
        res.body.should.be.empty();
        done();
      })
  });


  it('should send modified document since', done => {
    self.instance.get(`${self.url}/${self.validDoc.identifier}?token=${self.token.read}`)
      .set('If-Modified-Since', new Date(new Date(self.validDoc.date).getTime() - 1000).toUTCString())
      .expect(200)
      .end((err, res) => {
        should.not.exist(err);
        res.body.should.containEql(self.validDoc);
        done();
      })
  });


  it('should recognize softly deleted document', done => {
    self.instance.delete(`${self.url}/${self.validDoc.identifier}?token=${self.token.delete}`)
      .expect(204)
      .end((err, res) => {
        should.not.exist(err);
        res.body.should.be.empty();

        self.instance.get(`${self.url}/${self.validDoc.identifier}?token=${self.token.read}`)
          .expect(410)
          .end((err, res) => {
            should.not.exist(err);
            res.body.should.be.empty();
            done();
          })
      })
  });


  it('should not found permanently deleted document', done => {
    self.instance.delete(`${self.url}/${self.validDoc.identifier}?permanent=true&token=${self.token.delete}`)
      .expect(204)
      .end((err, res) => {
        should.not.exist(err);
        res.body.should.be.empty();

        self.instance.get(`${self.url}/${self.validDoc.identifier}?token=${self.token.read}`)
          .expect(404)
          .end((err, res) => {
            should.not.exist(err);
            res.body.should.be.empty();
            done();
          })
      })
  });


  it('should found document created by APIv1', done => {

    const doc = Object.assign({}, self.validDoc, { 
      created_at: new Date(self.validDoc.date).toISOString() 
    });
    delete doc.identifier;

    self.instance.ctx.devicestatus.create([doc], (err) => {  // let's insert the document in APIv1's way
      should.not.exist(err);
      const identifier = doc._id.toString();
      delete doc._id;

      self.instance.get(`${self.url}/${identifier}?token=${self.token.read}`)
          .expect(200)
          .end((err, res) => {
            should.not.exist(err);
            res.body.should.containEql(doc);

            self.instance.delete(`${self.url}/${identifier}?permanent=true&token=${self.token.delete}`)
              .expect(204)
              .end((err, res) => {
                should.not.exist(err);
                res.body.should.be.empty();

                done();
              });
          });
    });
  });


});

