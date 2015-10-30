var Joi = require('joi');
var path = require('path');
var Boom = require('boom');
var db = require(path.normalize(__dirname + '/../../../../db'));
var authHelper = require(path.normalize(__dirname + '/../../auth/helper'));

/**
  * @apiVersion 0.3.0
  * @apiGroup Moderators
  * @api {POST} /admin/moderators Add Moderator
  * @apiName AddModerator
  * @apiPermission Super Administrator, Administrator,
  * @apiDescription Add a moderator to a board.
  *
  * @apiParam (Payload) {string} user_id The id of the user to add as a moderator.
  * @apiParam (Payload) {string} board_id The id of the board to add the moderator to.
  *
  * @apiSuccess {} STATUS 200 OK
  *
  * @apiError (Error 500) InternalServerError There was an issue adding the moderator.
  */
exports.add = {
  auth: { strategy: 'jwt' },
  plugins: { acls: 'adminModerators.add' },
  validate: {
    payload: {
      usernames: Joi.array().items(Joi.string().required()).unique().min(1).required(),
      board_id: Joi.string().required()
    }
  },
  handler: function(request, reply) {
    var usernames = request.payload.usernames;
    var boardId = request.payload.board_id;
    var promise = db.moderators.add(usernames, boardId)
    // update redis with new moderating boads
    .map(function(user) {
      return db.moderators.getUsersBoards(user.id)
      .then(function(moderating) {
        moderating = moderating.map(function(b) { return b.board_id; });
        var moderatingUser = { id: user.id, moderating: moderating };
        return authHelper.updateModerating(moderatingUser)
        .then(function() { return user; });
      });
    });
    return reply(promise);
  }
};

/**
  * @apiVersion 0.3.0
  * @apiGroup Moderators
  * @api {POST} /admin/moderators/remove Remove Moderator
  * @apiName RemoveModerator
  * @apiPermission Super Administrator, Administrator,
  * @apiDescription Remove a moderator from a board.
  *
  * @apiParam (Payload) {string} user_id The id of the user to remove from being a moderator.
  * @apiParam (Payload) {string} board_id The id of the board to remove the moderator from.
  *
  * @apiSuccess {} STATUS 200 OK
  *
  * @apiError (Error 500) InternalServerError There was an issue removing the moderator.
  */
exports.remove = {
  auth: { strategy: 'jwt' },
  plugins: { acls: 'adminModerators.remove' },
  validate: {
    payload: {
      usernames: Joi.array().items(Joi.string().required()).unique().min(1).required(),
      board_id: Joi.string().required()
    }
  },
  handler: function(request, reply) {
    var usernames = request.payload.usernames;
    var boardId = request.payload.board_id;
    var promise = db.moderators.remove(usernames, boardId)
    // update redis with new moderating boads
    .map(function(user) {
      return db.moderators.getUsersBoards(user.id)
      .then(function(moderating) {
        moderating = moderating.map(function(b) { return b.board_id; });
        var moderatingUser = { id: user.id, moderating: moderating };
        return authHelper.updateModerating(moderatingUser)
        .then(function() { return user; });
      });
    });
    return reply(promise);
  }
};
