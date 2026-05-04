export function createSheetPanelController({
  clearCommentReply,
  closeCommentSheet,
  closeNotificationSheet,
  openCommentSheet,
  openNotificationPost,
  openNotificationThread,
  startCommentReply
}) {
  function handleSheetPanelClick(event) {
    const closeNotificationsTarget = event.target.closest('[data-close-notifications]');
    if (closeNotificationsTarget) {
      closeNotificationSheet();
      return true;
    }

    const openNotificationThreadTarget = event.target.closest('[data-open-notification-thread]');
    if (openNotificationThreadTarget) {
      openNotificationThread(openNotificationThreadTarget.dataset.openNotificationThread);
      return true;
    }

    const openNotificationPostTarget = event.target.closest('[data-open-notification-post]');
    if (openNotificationPostTarget) {
      openNotificationPost(
        openNotificationPostTarget.dataset.openNotificationPost,
        openNotificationPostTarget.dataset.openNotificationComments === 'true'
      );
      return true;
    }

    const closeCommentsTarget = event.target.closest('[data-close-comments]');
    if (closeCommentsTarget) {
      closeCommentSheet();
      return true;
    }

    const clearReplyTarget = event.target.closest('[data-clear-comment-reply]');
    if (clearReplyTarget) {
      clearCommentReply();
      return true;
    }

    const openCommentsTarget = event.target.closest('[data-open-comments]');
    if (openCommentsTarget) {
      openCommentSheet(openCommentsTarget.dataset.openComments);
      return true;
    }

    const replyTarget = event.target.closest('[data-comment-reply]');
    if (replyTarget) {
      startCommentReply(replyTarget.dataset.commentReply, replyTarget.dataset.commentAuthor || 'SocialEra Member');
      return true;
    }

    return false;
  }

  return {
    handleSheetPanelClick
  };
}
