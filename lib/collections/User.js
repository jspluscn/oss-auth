
Note = Astro.Class({
  name: 'Note',
  fields: {
    editor: {
      type: 'string'
    },
    note: 'string',     
    date: {
      type: 'date',
      default: function() { return new Date();}
    }
  }
});

Auth = Astro.Class({
  name: 'Auth',
  fields: {
    app: {
      type: 'string'
    },
    token: {
      type: 'string',
      default: function() { return Meteor.uuid(); }
    },
    expires: {
      type: 'boolean',
      default: false
    }
  }
});

User = Astro.Class({    
  name: 'User',             
  collection: Meteor.users,
  fields: {
    username: 'string',
    usernameNormalized: 'string',
    emails: 'array',
    services: 'object',
    profile: 'object',
    roles: 'object',
    lastIp: 'string',
    active: {
      type: 'boolean',
      default: true
    },
    external: {
      type: 'object',
      default: function() { return {}; }
    },
    notes: {
      type: 'array',
      nested: 'Note',
      default: function() { return []; }
    },
    authorizations: {
      type: 'array',
      nested: 'Auth',
      default: function() { return []; }
    }
  },
  events: {
    beforeUpdate: function() {
      this.usernameNormalized=this.username.toLowerCase().replace("'","").replace(/ /g,"_");
    },
    beforeSave: function() {
      this.usernameNormalized=this.username.toLowerCase().replace("'","").replace(/ /g,"_");
    }
  },
  methods: {
    disable: function() {
      this.set('active', false);
      this.save();
    },
    enable: function() {
      this.set('active', true);
      this.save();
    },
    getRoles: function(normalized) {
      if (normalized && this.roles && this.group(true)) {
        return this.roles[this.group(true)];
      }
      roles=[];
      _.each(this.roles, function(r, g) {
        _.each(r, function(role) {
          roles.push(g.replace(/_/g, ".")+"."+role);
        });
      });
      return roles;
    },
    hasAuthorized: function(app) {
      if (!app) return false;
      var found=false;
      _.each(this.authorizations, function(a) {
        if (app._id==a.app) found=a;
      });
      return found;
    },
    addAuthorization: function(app, token) {
      var a=new Auth({app: app._id});
      var at=this.hasAuthorized(app);
      if (at) {
        if (token) {
          Meteor.users.update({_id: this._id, 'authorizations.app': app._id}, {$set: {"authorizations.$.token": token}});
          at.token=token;
        }
        return at;
      }
      if (token) a.token=token;
      this.push('authorizations', a);
      this.save();
      return a;
    },
    hasRole: function(role) {
      if (!_.isArray(role)) role=[role];
      return (this.group() && this.roles && _.intersection(this.roles[this.group(true)], role).length);
    },
    removeRole: function(role) {
      role=role.toString();
      //console.log("removeRole", this.username, role, this.group(true));
      var group=this.group(true);   
      if (_.contains(role, ".")) {
        var tmp=role.split(".");
        group=tmp[0].split(".").join("_");
        role=tmp[1];
      }
      if (group && this.roles && this.roles[group]) {
        //console.log("setRole", "roles."+group, _.without(this.roles[group], role));
        this.set("roles."+group, _.without(this.roles[group], role));
        this.save();
      }
    },
    setRoles: function(g, roles) {
      var group=g.split(".").join("_");
      if (
        (
          !this.hasRole("Member") || 
          group!=this.group(true) 
        )
        &&
        (
          !this.getMain() ||
          Corporations.findOne({ticker: g}).corporationID==this.getMain().corporationID
        )
      ) { // TODO: what if user changes corp? maybe reset should do => change main or wait until api updates will do
        var r={};
        if (!_.isArray(roles)) roles=[roles];
        r[group]=roles;
        this.set("roles", r);
        this.save();
      }
    },
    resetRoles: function() {
      this.set("roles", {});
      this.save();
    },
    addRole: function(role) {
      var group=this.group(true);
      if (group) {
        if (_.contains(role, ".")) {
          var tmp=role.split(".");
          role=tmp[1];
        }
        if (role=="Admin" && !Meteor.isServer) {
          throw new Meteor.Error("Cannot make a user Admin");
        }
        if (!this.hasRole(role)) {
          this.push("roles."+group, role);
          this.save();
        }
      } else {
        throw new Meteor.Error("Cannot assign user to a group that he is not a member of.");
      }
    },
    group: function(notNormalized) {
      var group;
      _.each(this.roles, function(r, g) {
        if (_.contains(r, 'Member')) group=g;
      });
      if (notNormalized) return group;
      if (group) return group.replace(/_/g, ".");
      return false;
    },
    getCorporation: function() {
      return Corporations.findOne({ticker: this.group(false)})
    },
    getMain: function() {
      if (!this.profile.main) return false;
      return Characters.findOne(this.profile.main);
    }
  },
  behaviors: ['timestamp']
});

Meteor.users.allow({
  update: function (userId, user, fields, modifier) {
    // can only change your own documents
    console.log("user update",fields);
    if (Meteor.user().hasRole(["Admin", "Director"])) return true;
    return false;
  }
});