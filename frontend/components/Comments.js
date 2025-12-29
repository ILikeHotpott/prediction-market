"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronUp, Heart, MessageSquare } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"

const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

export default function Comments({ marketId, user, openAuthModal }) {
  const [comments, setComments] = useState([])
  const [holdersOnly, setHoldersOnly] = useState(true)
  const [sort, setSort] = useState("newest")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [drafts, setDrafts] = useState({ root: "" })
  const [postingIds, setPostingIds] = useState({})
  const [replyTarget, setReplyTarget] = useState(null)

  const totalCount = useMemo(() => {
    let count = 0
    const walk = (items) => {
      for (const c of items) {
        count += 1
        if (c.replies?.length) walk(c.replies)
      }
    }
    walk(comments)
    return count
  }, [comments])

  useEffect(() => {
    if (!marketId) return
    loadComments()
  }, [marketId, sort, holdersOnly, user?.id])

  const loadComments = async () => {
    setLoading(true)
    setError("")
    try {
      const url = new URL(`${backendBase}/api/markets/${marketId}/comments/`)
      url.searchParams.set("sort", sort)
      if (holdersOnly) {
        url.searchParams.set("holders_only", "1")
      }
      const res = await fetch(url.toString(), {
        headers: user?.id ? { "X-User-Id": user.id } : undefined,
      })
      if (!res.ok) {
        throw new Error(`Failed to load comments (${res.status})`)
      }
      const data = await res.json()
      setComments(data.items || [])
    } catch (err) {
      setError(err.message || "Failed to load comments")
    } finally {
      setLoading(false)
    }
  }

  const updateDraft = (key, value) => {
    setDrafts((prev) => ({ ...prev, [key]: value }))
  }

  const submitComment = async (parentId = null) => {
    const draftKey = parentId || "root"
    const content = (drafts[draftKey] || "").trim()
    if (!user) {
      openAuthModal?.()
      return
    }
    if (!content) return

    setPostingIds((prev) => ({ ...prev, [draftKey]: true }))
    try {
      const res = await fetch(`${backendBase}/api/markets/${marketId}/comments/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(user?.id ? { "X-User-Id": user.id } : {}),
        },
        body: JSON.stringify({ content, parent_id: parentId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || "Failed to post comment")
      }
      updateDraft(draftKey, "")
      if (parentId) {
        setReplyTarget(null)
      }
      await loadComments()
    } catch (err) {
      setError(err.message || "Failed to post comment")
    } finally {
      setPostingIds((prev) => ({ ...prev, [draftKey]: false }))
    }
  }

  const filteredComments = useMemo(() => comments, [comments])

  const renderSkeletons = () => (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, idx) => (
        <div
          key={idx}
          className="p-4 rounded-lg border border-gray-800 bg-[#0f172a]"
        >
          <div className="flex gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-3">
              <div className="flex gap-2 items-center">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-12" />
              </div>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="bg-[#1e293b] dark:bg-[#0f172a] rounded-lg border border-gray-700 p-6">
      <div className="flex gap-6 border-b border-gray-700 mb-6">
        <button className="pb-3 border-b-2 border-white text-white font-semibold">
          Comments ({totalCount.toLocaleString()})
        </button>
        <span className="pb-3 text-gray-500">Top Holders</span>
        <span className="pb-3 text-gray-500">Activity</span>
      </div>

      <div className="mb-6">
        <input
          type="text"
          value={drafts.root || ""}
          onChange={(e) => updateDraft("root", e.target.value)}
          placeholder={user ? "Add a comment" : "Sign in to add a comment"}
          className="w-full bg-[#334155] dark:bg-[#1e293b] text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-700"
          disabled={!user}
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={() => submitComment(null)}
            disabled={postingIds.root}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900 text-white rounded-lg transition-colors"
          >
            {postingIds.root ? "Posting..." : "Post"}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-sm">Sort by:</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="bg-[#334155] dark:bg-[#1e293b] text-white px-3 py-1.5 rounded border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={holdersOnly}
            onChange={(e) => setHoldersOnly(e.target.checked)}
            className="w-4 h-4 rounded border-gray-700 bg-[#334155] text-blue-600 focus:ring-blue-500"
          />
          <span className="text-blue-500 text-sm">✓ Holders</span>
        </label>
        <div className="ml-auto text-blue-500 text-sm">⚠️ Beware of external links.</div>
      </div>

      {error && <div className="text-red-400 text-sm mb-3">{error}</div>}
      {loading && comments.length === 0 ? (
        renderSkeletons()
      ) : filteredComments.length === 0 ? (
        <div className="text-gray-400">No comments yet.</div>
      ) : (
        <div className="space-y-4">
          {filteredComments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              user={user}
              drafts={drafts}
              updateDraft={updateDraft}
              submitComment={submitComment}
              postingIds={postingIds}
              replyTarget={replyTarget}
              setReplyTarget={setReplyTarget}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CommentItem({
  comment,
  user,
  drafts,
  updateDraft,
  submitComment,
  postingIds,
  replyTarget,
  setReplyTarget,
  depth = 0,
}) {
  const [showHoldings, setShowHoldings] = useState(false)
  const hasMultipleHoldings = (comment.holdings || []).length > 1
  const draftKey = comment.id
  const replyDraft = drafts[draftKey] || ""

  const formatNumber = (value) => {
    const num = Number(value)
    if (Number.isNaN(num)) return value
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toFixed(2)
  }

  const primaryHolding = comment.holdings?.[0]
  const avatarUrl = comment.user?.avatar_url
  const displayInitial = (comment.user?.display_name || "U").slice(0, 1).toUpperCase()

  return (
    <div
      className={`group p-4 rounded-lg transition-colors ${
        depth ? "ml-6 border-l border-gray-800" : "bg-[#0f172a] border border-gray-800"
      }`}
    >
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-sm flex-shrink-0 overflow-hidden">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={comment.user?.display_name || "User avatar"}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none"
              }}
            />
          ) : (
            displayInitial
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-medium">{comment.user?.display_name || "User"}</span>
            {primaryHolding && (
              <div className="relative">
                <button
                  className="text-xs bg-green-600/20 text-green-300 px-2 py-1 rounded-full border border-green-700 flex items-center gap-1"
                  onClick={() => setShowHoldings((prev) => !prev)}
                >
                  <span>
                    {formatNumber(primaryHolding.shares)} {primaryHolding.option_title || "Position"}
                  </span>
                  {hasMultipleHoldings && (showHoldings ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                </button>
                {hasMultipleHoldings && showHoldings && (
                  <div className="absolute z-10 mt-2 w-64 bg-[#0f172a] border border-gray-700 rounded-lg shadow-lg p-3 space-y-2">
                    {comment.holdings.map((h, idx) => (
                      <div key={`${h.option_id}-${idx}`} className="text-xs text-gray-200 flex justify-between">
                        <span className="text-gray-300">{h.option_title || "Position"}</span>
                        <span className="text-gray-100">{formatNumber(h.shares)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <span className="text-gray-500 text-xs">• {formatTimeAgo(comment.created_at)}</span>
          </div>
          <p className="text-white mt-2">{comment.content}</p>
          <div className="flex items-center gap-4 mt-3 text-gray-400">
            <button className="flex items-center gap-1 hover:text-white text-sm" type="button">
              <Heart size={16} />
              <span>Like</span>
            </button>
            {user && (
              <button
                className="flex items-center gap-1 hover:text-white text-sm"
                onClick={() => {
                  setReplyTarget(draftKey)
                  updateDraft(draftKey, replyDraft || "")
                }}
                type="button"
              >
                <MessageSquare size={16} />
                Reply
              </button>
            )}
          </div>

          {user && replyTarget === draftKey && (
            <div className="mt-3">
              <input
                type="text"
                value={replyDraft}
                onChange={(e) => updateDraft(draftKey, e.target.value)}
                placeholder="Reply to this comment"
                className="w-full bg-[#1e293b] text-white px-3 py-2 rounded border border-gray-700"
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={() => submitComment(comment.id)}
                  disabled={postingIds[draftKey]}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900 text-white rounded"
                >
                  {postingIds[draftKey] ? "Posting..." : "Reply"}
                </button>
              </div>
            </div>
          )}

          {comment.replies?.length > 0 && (
            <div className="mt-4 space-y-3">
              {comment.replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  user={user}
                  drafts={drafts}
                  updateDraft={updateDraft}
                  submitComment={submitComment}
                  postingIds={postingIds}
                  replyTarget={replyTarget}
                  setReplyTarget={setReplyTarget}
                  depth={depth + 1}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function formatTimeAgo(isoDate) {
  if (!isoDate) return ""
  const date = new Date(isoDate)
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

