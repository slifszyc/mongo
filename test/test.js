var modella = require('modella'),
    mongo = require('../')('localhost:27017/modella-mongo'),
    mongoskin = require('mongoskin'),
    db = require('mongoskin').db('mongodb://localhost:27017/modella-mongo', {w: 1}),
    mquery = require('mquery'),
    maggregate = require('maggregate'),
    Batch = require('batch'),
    async = require('async'),
    expect = require('expect.js');

var User = modella('User')
  .attr('_id')
  .attr('name')
  .attr('age')
  .attr('email', {unique: true})
  .attr('password');

var AtomicUser = modella('AtomicUser')
  .attr('_id')
  .attr('name')
  .attr('age', {atomic: true})
  .attr('wage', {atomic: true})
  .attr('points', {atomic: true})
  .attr('email', {unique: true})
  .attr('password');

var Ticket = modella('Ticket')
  .attr('_id')
  .attr('created', {type: 'date'})
  .attr('viewed', {type: Date})
  .attr('message', {type: 'string'})
  .attr('creatorId', {type: mongoskin.ObjectID})
  .attr('responderId', {type: 'ObjectId'})
  .attr('fixId', {type: 'ObjectID'});

var OverrideUser = modella('OverrideUser')
  .attr('_id')
  .attr('name')
  .attr('password');


OverrideUser.prototype.toMongo = function() {
  var dump = {};
  var self = this;

  Object.keys(this.attrs).forEach(function (key) {
    var val = self.attrs[key];

    dump[key] = !!val.toJSON ? val.toJSON() : modella.utils.clone(val);
  });

  return dump;
};

OverrideUser.prototype.toJSON = function() {
  var dump = {};
  var self = this;

  Object.keys(this.attrs).forEach(function (key) {
    if (key === 'password') return;
    var val = self.attrs[key];

    dump[key] = !!val.toJSON ? val.toJSON() : modella.utils.clone(val);
  });

  return dump;
}; 


OverrideUser.use(mongo);
User.use(mongo);
AtomicUser.use(mongo);
Ticket.use(mongo);

/**
 * Initialize
 */

var user = new User();

var col = db.collection("User");
var atomiccol = db.collection("AtomicUser");
var ticketcol = db.collection("Ticket");
var overridecol = db.collection("OverrideUser");


describe("Modella-Mongo", function() {
  before(function(done) {
    col.remove({}, function() {
      ticketcol.remove({}, function() {
        atomiccol.remove({}, function() {
          overridecol.remove({}, done);
        });
      });
    });
  });

  it('should provide access to the ObjectID constructor', function() {
    expect(mongo.ObjectID).to.equal(mongoskin.ObjectID);
    expect(mongo.ObjectId).to.equal(mongoskin.ObjectID);
  });

  describe("collection", function() {
    it("sets the collection name", function() {
      var Foo = modella('Foo').use(mongo('bar'));
      expect(Foo.db.collection.collectionName).to.be('bar');
    });

    it("sets a default collection name", function() {
      var Baz = modella('Baz').use(mongo);
      expect(Baz.db.collection.collectionName).to.be('Baz');
    });
  });

  describe("sync layer operations", function() {
    it("defines the required sync layer operations", function() {
      expect(User.save).to.be.a('function');
      expect(User.update).to.be.a('function');
      expect(User.remove).to.be.a('function');
    });

    describe("save", function() {
      it("saves the record in the database", function(done) {
        var user = new User({name: 'Ryan', email: 'ryan@slingingcode.com'});
        user.save(function(err, u) {
          expect(user.primary()).to.be.ok();
          col.findOne({}, function(err, u) {
            expect(u).to.be.ok();
            expect(u).to.have.property('name', 'Ryan');
            done();
          });
        });
      });

      it("saves the record using toMongo if present", function(done) {
        var user = new OverrideUser({name: 'Ryan', email: 'ryan@slingingcode.com', password: 'foobar123'});
        user.save(function(err, u) {
          expect(user.primary()).to.be.ok();
          overridecol.findOne({}, function(err, u) {
            expect(u).to.be.ok();
            expect(u).to.have.property('name', 'Ryan');
            expect(u).to.have.property('password', 'foobar123');
            var uJSON = user.toJSON();
            expect(uJSON).to.not.have.property('password');
            done();
          });
        });
      });

      it("triggers errors if there is an error", function(done) {
        var user = new User({name: 'Ryan', email: 'ryan@slingingcode.com'});
        user.save();
        user.once('error', function(err) {
          expect(err).to.be.ok();
          done();
        });
      });

      it("parses a string as a date if the type is set to `'date'` or `Date`", function(done) {
        var ticket = new Ticket({
          created: '2014-01-01',
          viewed: '2014-01-02',
          message: 'Foo to you sir'
        });

        ticket.save(function(err) {
          expect(ticket.created() instanceof Date).to.be(true);
          expect(ticket.viewed() instanceof Date).to.be(true);
          done();
        });
      });

      it("parses a string as an ObjectID if the type is set to `ObjectID`", function(done) {
        var creatorId = new mongoskin.ObjectID();
        var responderId = new mongoskin.ObjectID();
        var fixId = new mongoskin.ObjectID();
        var ticket = new Ticket({
          created: '2014-01-01',
          viewed: '2014-01-02',
          message: 'Foo to you sir',
          creatorId: creatorId.toHexString(),
          responderId: responderId.toHexString(),
          fixId: fixId.toHexString()
        });

        ticket.save(function(err) {
          expect(ticket.created() instanceof Date).to.be(true);
          expect(ticket.viewed() instanceof Date).to.be(true);
          expect(ticket.creatorId() instanceof mongoskin.ObjectID).to.be(true);
          expect(ticket.creatorId().equals(creatorId)).to.be(true);
          expect(ticket.responderId() instanceof mongoskin.ObjectID).to.be(true);
          expect(ticket.responderId().equals(responderId)).to.be(true);
          expect(ticket.fixId() instanceof mongoskin.ObjectID).to.be(true);
          expect(ticket.fixId().equals(fixId)).to.be(true);
          ticket.viewed('2014-01-03');
          done();
        });
      });

    });

    describe("update", function() {
      it("updates an existing record in the database", function(done) {
        var user = new User({name: 'Bob', age: 30});
        user.save(function() {
          user.name('Eddie');
          user.save(function(err, u) {
            expect(err).to.not.be.ok();
            col.findOne({name: 'Eddie'}, function(err, u) {
              expect(u).to.be.ok();
              expect(u).to.have.property('name', 'Eddie');
              expect(u).to.have.property('age', 30);
              done();
            });
          });
        });
      });

      it("updates an existing record in the database with a string for _id", function(done) {
        var user = new User({_id: (new mongoskin.ObjectID()).toHexString(), name: 'Bob', age: 30});
        user.save(function() {
          user.name('Eddie');
          user.save(function(err, u) {
            expect(err).to.not.be.ok();
            col.findOne({name: 'Eddie'}, function(err, u) {
              expect(u).to.be.ok();
              expect(u).to.have.property('name', 'Eddie');
              expect(u).to.have.property('age', 30);
              done();
            });
          });
        });
      });

      it("parses a string as a date if the type is set to `'date'` or `Date`", function(done) {
        var ticket = new Ticket({
          created: '2014-01-01',
          viewed: '2014-01-02',
          message: 'Foo to you sir'
        });

        ticket.save(function(err) {
          expect(ticket.created() instanceof Date).to.be(true);
          expect(ticket.viewed() instanceof Date).to.be(true);
          ticket.viewed('2014-01-03');
          ticket.save(function(err) {
            expect(ticket.viewed() instanceof Date).to.be(true);
            done();
          });
        });
      });

      it("parses a string as an ObjectID if the type is set to `ObjectID`", function(done) {
        var creatorId = new mongoskin.ObjectID();
        var responderId = new mongoskin.ObjectID();
        var fixId = new mongoskin.ObjectID();
        var ticket = new Ticket({
          created: '2014-01-01',
          viewed: '2014-01-02',
          message: 'Foo to you sir',
          creatorId: creatorId.toHexString(),
          responderId: responderId.toHexString(),
          fixId: fixId.toHexString()
        });

        ticket.save(function(err) {
          expect(ticket.created() instanceof Date).to.be(true);
          expect(ticket.viewed() instanceof Date).to.be(true);
          expect(ticket.creatorId() instanceof mongoskin.ObjectID).to.be(true);
          expect(ticket.creatorId().equals(creatorId)).to.be(true);
          expect(ticket.responderId() instanceof mongoskin.ObjectID).to.be(true);
          expect(ticket.responderId().equals(responderId)).to.be(true);
          expect(ticket.fixId() instanceof mongoskin.ObjectID).to.be(true);
          expect(ticket.fixId().equals(fixId)).to.be(true);
          ticket.viewed('2014-01-03');
          var newCreatorId = new mongoskin.ObjectID();
          var newResponderId = new mongoskin.ObjectID();
          var newFixId = new mongoskin.ObjectID();
          ticket.creatorId(newCreatorId.toHexString());
          ticket.responderId(newResponderId.toHexString());
          ticket.fixId(newFixId.toHexString());
          ticket.save(function(err) {
            expect(ticket.viewed() instanceof Date).to.be(true);
            expect(ticket.creatorId() instanceof mongoskin.ObjectID).to.be(true);
            expect(ticket.creatorId().equals(newCreatorId)).to.be(true);
            expect(ticket.responderId() instanceof mongoskin.ObjectID).to.be(true);
            expect(ticket.responderId().equals(newResponderId)).to.be(true);
            expect(ticket.fixId() instanceof mongoskin.ObjectID).to.be(true);
            expect(ticket.fixId().equals(newFixId)).to.be(true);
            done();
          });
        });
      });

      it("updates an atomic property using $inc", function(done) {
        var user = new AtomicUser({name: 'Eddie', age: 30, wage: 7.75});
        user.save(function(err) {
          expect(err).to.not.be.ok();
          async.parallel([
            function(finished) {
              user.age("29");
              user.wage("7.50");
              user.save(function(err) {
                expect(err).to.not.be.ok();
                atomiccol.findOne({name: 'Eddie'}, function(err, u) {
                  expect(u).to.be.ok();
                  expect(u).to.have.property('name', 'Eddie');
                  expect(u).to.have.property('age', 31);
                  expect(u).to.have.property('wage', 8.25);
                  finished();
                });
              });
            },
            function(finished) {
              user.age(31);
              user.wage(8.25);
              user.points(3);
              user.save(function(err, u) {
                expect(err).to.not.be.ok();
                atomiccol.findOne({name: 'Eddie'}, function(err, u) {
                  expect(u).to.be.ok();
                  expect(u).to.have.property('name', 'Eddie');
                  expect(u).to.have.property('age', 31);
                  expect(u).to.have.property('wage', 8.25);
                });
                finished();
              });
            }
          ], function() {
            done();
          });
        });
      });

      it("uses $unset to remove undefined properties", function(done) {
        var user = new User({name: 'Eddie', age: 30, email: "eddie@eddiecorp.com"});
        user.save(function(err) {
          expect(err).to.not.be.ok();
          expect(user.email()).to.be("eddie@eddiecorp.com");
          user.set({
            email: undefined,
            password: 'password'
          });
          user.save(function(err) {
            expect(err).to.not.be.ok();
            expect(user.email() === undefined).to.be(true);
            expect(user.password()).to.be('password');
            done();
          });
        });
      });

      it("does not $unset when a value is not explicitly set to `undefined`", function(done) {
        var user = new User({name: 'Eddie', age: 30, email: "eddie@eddiecorp.com"});
        user.save(function(err) {
          expect(err).to.not.be.ok();
          expect(user.email()).to.be("eddie@eddiecorp.com");
          // load an incomplete user record
          User.get(user.primary().toHexString(), {fields: {age: true}}, function(err, user2) {
            user2.age(user2.age() + 1);
            user2.save(function(err) {
              expect(err).to.not.be.ok();
              expect(user2.email()).to.be("eddie@eddiecorp.com");
              expect(user2.age()).to.be(31);
              done();
            });
          });
        });
      });

      it("refuses to update a non-number atomic property", function(done) {
        var user = new AtomicUser({name: 'Eddie', age: 30});
        user.save(function(err) {
          expect(err).to.not.be.ok();
          user.age("foo");
          user.save(function(err) {
            expect(err).to.be.ok();
            expect(err.message).to.be("Atomic property age set to NaN");
            done();
          });
        });
      });

      it("doesn't call mongo if nothing changed (needed for mongo 2.6+)", function(done) {
        var user = new User({name: 'Ted'});
        user.save(function() {
          user.name('Ted');
          user.save(function(err) {
            expect(err).to.be(null);
            expect(user.name()).to.be('Ted');
            done();
          });
        });
      });

      it("triggers errors if there is an error", function(done) {
        var user = new User({name: 'Steve Holt'});
        user.save(function(err) {
          expect(err).to.not.be.ok();
          user.email('ryan@slingingcode.com');
          user.save(function(err) {
            expect(err).to.be.ok();
            done();
          });
        });
      });
    });

    describe("remove", function() {
      it("removes an existing record from the database", function(done) {
        var tony = new User({name: 'Tony'});
        tony.save(function(err) {
          expect(err).to.not.be.ok();
          tony.remove(function() {
            col.find({name: 'Tony'}).toArray(function(err, docs) {
              expect(err).to.not.be.ok();
              expect(docs).to.have.length(0);
              done();
            });
          });
        });
      });
      it("removes an existing record from the database with a string _id", function(done) {
        var tony = new User({_id: (new mongoskin.ObjectID()).toHexString(), name: 'Tony'});
        tony.save(function(err) {
          expect(err).to.not.be.ok();
          tony.remove(function() {
            col.find({name: 'Tony'}).toArray(function(err, docs) {
              expect(err).to.not.be.ok();
              expect(docs).to.have.length(0);
              done();
            });
          });
        });
      });
    });
  });

  describe("additional methods", function() {
    var user;
    before(function(done) {
      var batch = new Batch();
      user = new User({name: 'steven', age: 40});
      batch.push(user.save.bind(user));
      user = new User({name: 'steven', age: 60});
      batch.push(user.save.bind(user));
      user = new User({name: 'steven', age: 20});
      batch.push(user.save.bind(user));
      batch.end(done);
    });

    describe("Model.all", function() {
      it("returns empty array if no records match", function(done) {
        User.all({name: 'brobobski'}, function(err, users) {
          expect(err).to.not.be.ok();
          expect(users).to.be.a(Array);
          expect(users).to.have.length(0);
          done();
        });
      });
      it("returns instances of models", function(done) {
        User.all({name: 'steven'}, function(err, users) {
          expect(err).to.not.be.ok();
          expect(users).to.have.length(3);
          expect(users[0]).to.be.a(User);
          done();
        });
      });
      it("forwards options", function(done) {
        User.all({name: 'steven'}, {limit: 1, sort: {age: -1}}, function(err, users) {
          expect(err).to.not.be.ok();
          expect(users).to.have.length(1);
          expect(users[0].age()).to.be(60);
          done();
        });
      });
    });

    describe("Model.get", function() {
      it("aliases to Model.find", function() {
        expect(User.get).to.be(User.find);
      });
      it("returns false if the model doesn't exist", function(done) {
        User.get({name: 'lsadkfjsadlkf'}, function(err, u) {
          expect(err).to.not.be.ok();
          expect(u).to.not.be.ok();
          done();
        });
      });
      it("returns an instance of the model", function(done) {
        User.get({name: 'steven'}, function(err, u) {
          expect(u).to.be.ok();
          expect(u).to.be.a(User);
          done();
        });
      });
      it("converts a string to an ID", function(done) {
        User.get(user.primary().toString(), function(err, u) {
          expect(u).to.be.ok();
          expect(u).to.be.a(User);
          done();
        });
      });
      it("converts a string in _id to a ID", function(done) {
        User.get({_id: user.primary().toString()}, function(err, u) {
          expect(u).to.be.ok();
          expect(u).to.be.a(User);
          done();
        });
      });

      it("returns false if undefined is passed in", function(done) {
        User.get(undefined, function(err, u) {
          expect(u).to.not.be.ok();
          done();
        });
      });

      it("forwards options", function(done) {
        User.get({name: 'steven'}, {sort: {age: -1}}, function(err, u) {
          expect(u.age()).to.be(60);
          done();
        });
      });
    });

    describe("Model.removeAll", function() {
      before(function(done) {
        var batch = new Batch(),
        user;
        for(var i = 0; i < 5; ++i) {
          user = new User({name: 'soonToBeDeleted'});
          batch.push(user.save.bind(user));
        }
        batch.end(done);
      });
      it("removes all records that match the query", function(done) {
        User.removeAll({name: 'soonToBeDeleted'}, function(err, count) {
          expect(count).to.be(5);
          done();
        });
      });
    });

    describe("Model.query", function() {
      it("returns a new instance of mquery", function() {
        var queryA = User.query(),
        queryB = User.query();
        expect(queryA).to.not.be(queryB);
      });

      it("wraps the mquery methods", function(done) {
        User.query().findOne().where({name: 'steven'}).sort({age: -1}).exec(function(err, u) {
          expect(err).to.not.be.ok();
          expect(u).to.be.a(User);
          expect(u.age()).to.be(60);
          done();
        });
      });
    });

    describe("Model.aggregate", function() {
      it("returns an instance of maggregate", function() {
        expect(User.aggregate()).to.be.a(maggregate);
      });
      it("wraps by default", function(done) {
        User.aggregate().match({name: 'steven'}, function(err, users) {
          expect(users).to.have.length(3);
          expect(users[0]).to.be.a(User);
          done();
        });
      });
      it("lets you skip wrapping", function(done) {
        User.aggregate(true).match({name: 'steven'}).group({_id: '$name', count: {$sum: 1}}).exec(function(err, rep) {
          expect(rep).to.have.length(1);
          expect(rep[0].count).to.be(3);
          done();
        });
      });
    });
  });
});
