import React, { useState, useEffect } from 'react';
import { UserProfile, CommentRecord } from '../types';
import { getComments, addComment, updateComment, deleteComment } from '../firebase';
import { MessageSquare, Send, Edit2, Trash2, Check, X, Loader2, Sparkles } from 'lucide-react';

interface CommentsSectionProps {
  currentUser: UserProfile;
}

export const CommentsSection: React.FC<CommentsSectionProps> = ({ currentUser }) => {
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContentText, setEditContentText] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadCommentsList();
  }, []);

  const loadCommentsList = async () => {
    setLoading(true);
    try {
      const list = await getComments();
      setComments(list);
    } catch (err) {
      console.error('Error loading comments:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;

    setActionLoading(true);
    try {
      const created = await addComment(newCommentText, currentUser);
      setComments(prev => [created, ...prev]);
      setNewCommentText('');
    } catch (err) {
      console.error('Error posting comment:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartEdit = (comment: CommentRecord) => {
    setEditingId(comment.id);
    setEditContentText(comment.content);
  };

  const handleSaveEdit = async (commentId: string) => {
    if (!editContentText.trim()) return;
    setActionLoading(true);
    try {
      await updateComment(commentId, editContentText);
      setComments(prev =>
        prev.map(c => (c.id === commentId ? { ...c, content: editContentText } : c))
      );
      setEditingId(null);
    } catch (err) {
      console.error('Error updating comment:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!window.confirm('Are you sure you want to delete this comment?')) return;
    setActionLoading(true);
    try {
      await deleteComment(commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (err) {
      console.error('Error deleting comment:', err);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="p-5 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center space-x-2">
          <MessageSquare className="w-4 h-4 text-red-600" />
          <span>Member Forum & Comments ({comments.length})</span>
        </h3>
        <span className="text-[10px] text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded-md">
          Community
        </span>
      </div>

      {/* Post Comment Input */}
      <form onSubmit={handlePostComment} className="flex items-center space-x-2">
        <input
          type="text"
          value={newCommentText}
          onChange={e => setNewCommentText(e.target.value)}
          placeholder="Share a message or update..."
          className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:bg-white"
        />
        <button
          type="submit"
          disabled={actionLoading || !newCommentText.trim()}
          className="p-2.5 bg-red-600 hover:bg-red-700 text-white rounded-2xl transition-all disabled:opacity-50 cursor-pointer shadow-md"
          title="Post Comment"
        >
          {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>

      {/* Comments List */}
      <div className="space-y-3 pt-2">
        {loading ? (
          <div className="text-center py-6 text-slate-400 text-xs flex items-center justify-center space-x-2">
            <Loader2 className="w-4 h-4 animate-spin text-red-600" />
            <span>Loading discussion...</span>
          </div>
        ) : comments.length === 0 ? (
          <p className="text-center py-6 text-slate-400 text-xs italic">
            No comments yet. Be the first to start the conversation!
          </p>
        ) : (
          comments.map(c => {
            const isAuthor = c.authorUid === currentUser.uid;
            const canManage = isAuthor || currentUser.role === 'Founder' || currentUser.role === 'Super Admin';
            const isEditing = editingId === c.id;

            return (
              <div
                key={c.id}
                className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2 hover:border-slate-300 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {c.authorPhoto ? (
                      <img
                        src={c.authorPhoto}
                        alt={c.authorName}
                        referrerPolicy="no-referrer"
                        className="w-6 h-6 rounded-full object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-red-100 text-red-600 font-bold text-[10px] flex items-center justify-center shrink-0">
                        {c.authorName ? c.authorName.charAt(0) : 'U'}
                      </div>
                    )}
                    <span className="text-xs font-bold text-slate-900 truncate">{c.authorName}</span>
                  </div>

                  {canManage && (
                    <div className="flex items-center space-x-1">
                      {isAuthor && !isEditing && (
                        <button
                          onClick={() => handleStartEdit(c)}
                          className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-md transition-colors"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <div className="flex items-center space-x-2 pt-1">
                    <input
                      type="text"
                      value={editContentText}
                      onChange={e => setEditContentText(e.target.value)}
                      className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-red-500"
                    />
                    <button
                      onClick={() => handleSaveEdit(c.id)}
                      className="p-1.5 bg-emerald-600 text-white rounded-lg text-xs hover:bg-emerald-700"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1.5 bg-slate-200 text-slate-700 rounded-lg text-xs hover:bg-slate-300"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-700 leading-relaxed font-normal">{c.content}</p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
