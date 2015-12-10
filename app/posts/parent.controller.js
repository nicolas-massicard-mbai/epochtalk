var some = require('lodash/collection/some');

var ctrl = [
  '$scope', '$timeout', '$location', '$state', 'Session', 'Boards', 'Posts', 'Threads', 'Reports', 'Alert', 'BreadcrumbSvc',
  function($scope, $timeout, $location, $state, Session, Boards, Posts, Threads, Reports, Alert, BreadcrumbSvc) {
    var ctrl = this;
    this.loggedIn = Session.isAuthenticated;
    this.dirtyEditor = false;
    this.resetEditor = false;
    this.showEditor = false;
    this.focusEditor = false;
    this.quote = '';
    this.posting = { post: { body: '', raw_body: '' } };
    this.editorPosition = 'editor-fixed-bottom';
    this.resize = true;
    this.moveBoard = {};
    this.boards = [];
    this.controlAccess = {};
    this.pollControlAccess = {};
    this.reportControlAccess = {
      reportPosts: Session.hasPermission('reportControls.reportPosts'),
      reportUsers: Session.hasPermission('reportControls.reportUsers')
    };
    this.postControlAccess = {
      create: Session.hasPermission('postControls.create')
    };
    this.showThreadControls = false;
    // wait for board_id to be populated by child controller
    $scope.$watch(function() { return ctrl.board_id; }, function(boardId) {
      // Get access rights to page controls for authed user
      ctrl.controlAccess = Session.getControlAccess('threadControls', boardId);
      // thread owner can lock and edit title
      if (ctrl.user.id === ctrl.thread.user.id) {
        ctrl.controlAccess.privilegedLock = ctrl.controlAccess.lock;
        ctrl.controlAccess.privilegedTitle = ctrl.controlAccess.title;
      }
      ctrl.privilegedControlAccess = angular.copy(ctrl.controlAccess);
      delete ctrl.privilegedControlAccess.lock; // remove non privileged permissions
      delete ctrl.privilegedControlAccess.title;
      delete ctrl.privilegedControlAccess.create;
      ctrl.showThreadControls = some(ctrl.privilegedControlAccess);

      // poll control access
      ctrl.pollControlAccess = Session.getControlAccess('pollControls', boardId);
      if (ctrl.user.id === ctrl.thread.user.id) {
        ctrl.pollControlAccess.privilegedLock = ctrl.pollControlAccess.lock;
      }

      // poll expiration
      if (ctrl.thread.poll.expiration) {
        var expiry = new Date(ctrl.thread.poll.expiration);
        ctrl.thread.poll.expired = expiry < Date.now();
      }

      // get boards for mods and admins
      ctrl.getBoards();
    });

    this.allowPosting = function() {
      var bypassLock = Session.hasPermission('postControls.bypassLock') &&
        Session.moderatesBoard(ctrl.thread.board_id);
      var allowed = false;
        if (!ctrl.loggedIn()) { allowed = false; }
        else if (bypassLock) { allowed = true; }
        else if (!ctrl.thread.locked) { allowed = true; }
      return allowed;
    };

    this.getBoards = function() {
      if (ctrl.controlAccess.privilegedMove) {
        return Boards.all().$promise
        .then(function(allBoards) {
          ctrl.boards = allBoards || [];
          ctrl.boards.map(function(board) {
            if (board.id === ctrl.thread.board_id) { ctrl.moveBoard = board; }
          });
        });
      }
    };

    /* Thread Methods */

    this.editThread = false;
    var threadTitle = '';
    this.openEditThread = function() {
      threadTitle = ctrl.thread.title;
      ctrl.editThread = true;
    };
    this.closeEditThread = function() {
      ctrl.editThread = false;
      ctrl.thread.title = threadTitle;
    };
    this.updateThreadTitle = function() {
      var title = ctrl.thread.title;
      return Threads.title({id: ctrl.thread.id}, {title: title}).$promise
      .then(function() { ctrl.editThread = false; })
      .then(function() {
        Alert.success('Thread\'s title changed to: ' + title);
        BreadcrumbSvc.updateLabelInPlace(title);
      })
      .catch(function() { Alert.error('Error changing thread title'); });
    };

    this.updateThreadLock = function() {
      // let angular digest the change in lock status
      $timeout(function() {
        var lockStatus = ctrl.thread.locked;
        return Threads.lock({id: ctrl.thread.id}, {status: lockStatus}).$promise
        .then(function(lockThread) { ctrl.thread.locked = lockThread.locked; })
        .catch(function() { Alert.error('Error Locking Thread'); });
      });
    };

    this.updateThreadSticky = function() {
      // let angular digest the change in lock status
      $timeout(function() {
        var stickyStatus = ctrl.thread.sticky;
        return Threads.sticky({id: ctrl.thread.id}, {status: stickyStatus}).$promise
        .then(function(stickyThread) { ctrl.thread.sticky = stickyThread.sticky; })
        .catch(function() { Alert.error('Error Sticking Thread'); });
      });
    };

    this.moveThread = function() {
      var newBoardId = ctrl.moveBoard.id;
      return Threads.move({id: ctrl.thread.id}, {newBoardId: newBoardId}).$promise
      .then(function() { $state.go($state.$current, null, {reload:true}); })
      .catch(function() { Alert.error('Error Moving Thread'); });
    };

    this.showPurgeThreadModal = false;
    this.closePurgeThreadModal = function() {
      $timeout(function() { ctrl.showPurgeThreadModal = false; });
    };
    this.openPurgeThreadModal = function() { ctrl.showPurgeThreadModal = true; };
    this.purgeThread = function() {
      Threads.delete({id: ctrl.thread.id}).$promise
      .then(function() { $state.go('board.data', {boardId: ctrl.board_id}); })
      .catch(function() { Alert.error('Failed to purge Thread'); })
      .finally(function() { ctrl.showPurgeThreadModal = false; });
    };

    /* Poll Methods */
    this.pollAnswers = [];

    this.toggleAnswer = function(answerId) {
      var maxAnswers = ctrl.thread.poll.max_answers;
      var idx = ctrl.pollAnswers.indexOf(answerId);
      if (idx > -1) { ctrl.pollAnswers.splice(idx, 1); }
      else if (ctrl.pollAnswers.length < maxAnswers) { ctrl.pollAnswers.push(answerId); }
    };

    this.showPollResults = function() {
      var show = false;
      var displayMode = ctrl.thread.poll.display_mode;
      var hasVoted = ctrl.thread.poll.hasVoted;
      var expired = ctrl.thread.poll.expired;
      if (displayMode === 'always') { show = true; }
      else if (displayMode === 'voted' && hasVoted) { show = true; }
      else if (displayMode === 'expired' && expired) { show = true; }
      return show;
    };

    this.vote = function() {
      var threadId = ctrl.thread.id;
      var pollId = ctrl.thread.poll.id;
      var answerIds = ctrl.pollAnswers;

      Threads.vote({ threadId: threadId, pollId: pollId, answerIds: answerIds}).$promise
      .then(function(data) {
        ctrl.pollAnswers = [];
        ctrl.thread.poll = data;
        ctrl.calculatePollPercentage();
        Alert.success('Voted in poll');
      })
      .catch(function() { Alert.error('Vote could not be processed'); });
    };

    this.removeVote = function() {
      var threadId = ctrl.thread.id;
      var pollId = ctrl.thread.poll.id;

      Threads.removeVote({ threadId: threadId, pollId: pollId }).$promise
      .then(function(data) {
        ctrl.pollAnswers = [];
        ctrl.thread.poll = data;
        ctrl.calculatePollPercentage();
        Alert.success('Removed Vote from Poll');
      })
      .catch(function(err) { Alert.error('Error: ' + err.data.message); });
    };

    this.updateLockPoll = function() {
      $timeout(function() {
        var input = {
          threadId: ctrl.thread.id,
          pollId: ctrl.thread.poll.id,
          lockValue: ctrl.thread.poll.locked
        };
        return Threads.lockPoll(input).$promise
        .catch(function() {
          ctrl.thread.poll.locked = !ctrl.thread.poll.locked;
          Alert.error('Error Locking Poll');
        });
      });
    };

    /* Post Methods */

    var discardAlert = function() {
      if (ctrl.dirtyEditor) {
        var message = 'It looks like you were working on something. ';
        message += 'Are you sure you want to leave that behind?';
        return confirm(message);
      }
      else { return true; }
    };

    function closeEditor() {
      ctrl.posting.post.raw_body = '';
      ctrl.posting.post.body = '';
      ctrl.resetEditor = true;
      ctrl.showEditor = false;
    }

    this.addQuote = function(index) {
      var timeDuration = 0;
      if (ctrl.showEditor === false) {
        ctrl.showEditor = true;
        timeDuration = 100;
      }

      $timeout(function() {
        var post = ctrl.posts && ctrl.posts[index] || '';
        if (post) {
          ctrl.quote = {
            username: post.user.username,
            threadId: ctrl.thread.id,
            page: ctrl.page,
            postId: post.id,
            createdAt: new Date(post.created_at).getTime(),
            body: post.raw_body || post.body
          };
        }
      }, timeDuration);
    };

    this.loadEditor = function(index) {
      if (discardAlert()) {
        var post = (ctrl.posts && ctrl.posts[index]) || {};
        ctrl.posting.index = index;
        var editorPost = ctrl.posting.post;
        editorPost.id = post.id || '';
        editorPost.body = post.body || '';
        editorPost.raw_body = post.raw_body || '';
        ctrl.resetEditor = true;
        ctrl.showEditor = true;
        ctrl.focusEditor = true;
      }
    };

    this.savePost = function() {
      var post = ctrl.posting.post;
      var type = post.id ? 'update' : 'create';
      post.title = 'Re: ' + ctrl.thread.title;
      post.thread_id = ctrl.thread.id;

      var postPromise;
      if (post.id) { postPromise = Posts.update(post).$promise; }
      else { postPromise = Posts.save(post).$promise; }

      postPromise.then(function(data) {
        if (type === 'create') {
          // Increment post count and recalculate ctrl.pageCount
          ctrl.thread.post_count++;
          ctrl.pageCount = Math.ceil(ctrl.thread.post_count / ctrl.limit);
          // Go to last page in the thread and scroll to new post
          var lastPage = ctrl.pageCount;
          $location.search('page', lastPage).hash(data.id);
          if (ctrl.page === lastPage) { ctrl.pullPage(); }
        }
        else if (type === 'update') {
          var editPost = ctrl.posts[ctrl.posting.index];
          editPost.body = data.body;
          editPost.raw_body = data.raw_body;
        }
      })
      .then(closeEditor)
      .catch(function(err) {
        var error = 'Post could not be saved';
        if (err.status === 429) { error = 'Post Rate Limit Exceeded'; }
        Alert.error(error);
      });
    };

    this.cancelPost = function() { if (discardAlert()) { closeEditor(); } };

    this.deletePostIndex = -1;
    this.showDeleteModal = false;
    this.closeDeleteModal = function() {
      $timeout(function() { ctrl.showDeleteModal = false; });
    };
    this.openDeleteModal = function(index) {
      ctrl.deletePostIndex = index;
      ctrl.showDeleteModal = true;
    };
    this.deletePost = function() {
      var index = ctrl.deletePostIndex;
      var post = ctrl.posts && ctrl.posts[index] || '';
      if (post) {
        Posts.delete({id: post.id}).$promise
        .then(function() { post.deleted = true; })
        .catch(function() { Alert.error('Failed to delete post'); })
        .finally(function() { ctrl.showDeleteModal = false; });
      }
    };

    this.undeletePostIndex = -1;
    this.showUndeleteModal = false;
    this.closeUndeleteModal = function() {
      $timeout(function() { ctrl.showUndeleteModal = false; });
    };
    this.openUndeleteModal = function(index) {
      ctrl.undeletePostIndex = index;
      ctrl.showUndeleteModal = true;
    };
    this.undeletePost = function() {
      var index = ctrl.undeletePostIndex;
      var post = ctrl.posts && ctrl.posts[index] || '';
      if (post) {
        Posts.undelete({id: post.id}).$promise
        .then(function() { post.deleted = false; })
        .catch(function() { Alert.error('Failed to Undelete Post'); })
        .finally(function() { ctrl.showUndeleteModal = false; });
      }
    };

    this.purgePostIndex = -1;
    this.showPurgeModal = false;
    this.closePurgeModal = function() {
      $timeout(function() { ctrl.showPurgeModal = false; });
    };
    this.openPurgeModal = function(index) {
      ctrl.purgePostIndex = index;
      ctrl.showPurgeModal = true;
    };
    this.purgePost = function() {
      var index = ctrl.purgePostIndex;
      var post = ctrl.posts && ctrl.posts[index] || '';
      if (post) {
        Posts.purge({id: post.id}).$promise
        .then(function() { $state.go($state.$current, null, {reload:true}); })
        .catch(function() { Alert.error('Failed to purge Post'); })
        .finally(function() { ctrl.showPurgeModal = false; });
      }
    };

    var isFullscreen = true;
    this.fullscreen = function() {
      if (isFullscreen) {
        isFullscreen = false;
        this.editorPosition = 'editor-full-screen';
        this.resize = false;
      }
      else {
        isFullscreen = true;
        this.editorPosition = 'editor-fixed-bottom';
        this.resize = true;
      }
    };

    /* User/Post Reporting */

    this.reportedPost = {}; // Object being reported
    this.showReportModal = false; // Visible state of modal
    this.offendingId = undefined; // Is the post or user id being reported
    this.reportReason = ''; // The reason for the report
    this.reportSubmitted = false; // Has the report been submitted
    this.reportBtnLabel = 'Submit Report'; // Button label for modal
    this.user = Session.user; // Logged in user
    this.openReportModal = function(post) {
      ctrl.reportedPost = post;
      ctrl.showReportModal = true;
    };

    this.closeReportModal = function() {
      $timeout(function() {
        ctrl.showReportModal = false;
        ctrl.offendingId = undefined;
        ctrl.reportReason = '';
        ctrl.reportedPost = {};
        ctrl.reportSubmitted = false;
        ctrl.reportBtnLabel = 'Submit Report';
      }, 500);
    };

    this.submitReport = function() {
      ctrl.reportSubmitted = true;
      ctrl.reportBtnLabel = 'Submitting...';
      var report = { // build report
        reporter_user_id: ctrl.user.id,
        reporter_reason: ctrl.reportReason
      };
      var reportPromise;
      if (ctrl.offendingId === ctrl.reportedPost.id) { // Post report
        report.offender_post_id = ctrl.offendingId;
        reportPromise = Reports.createPostReport(report).$promise;
      }
      else { // User report
        report.offender_user_id = ctrl.offendingId;
        reportPromise = Reports.createUserReport(report).$promise;
      }
      reportPromise.then(function() {
        ctrl.closeReportModal();
        $timeout(function() { Alert.success('Successfully sent report'); }, 500);
      })
      .catch(function() {
        ctrl.closeReportModal();
        $timeout(function() { Alert.error('Error sending report, please try again later'); }, 500);
      });
    };
  }
];

module.exports = angular.module('ept.posts.parentCtrl', [])
.controller('PostsParentCtrl', ctrl)
.name;
