"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronUp, Heart, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

export default function Comments({ marketId, user, openAuthModal }) {
  const [comments, setComments] = useState([])
  const [commentsCache, setCommentsCache] = useState({})
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
    const cacheKey = `${marketId || "none"}|${sort}|${holdersOnly ? "holders" : "all"}`
    if (commentsCache[cacheKey]) {
      setComments(commentsCache[cacheKey])
      setLoading(false)
      return
    }
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
      setCommentsCache((prev) => ({ ...prev, [cacheKey]: data.items || [] }))
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
      setCommentsCache({})
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
          className="p-4 rounded-xl bg-white/5 backdrop-blur shadow-sm"
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
    <Card
      className="text-white shadow-2xl border border-[#2f4b3c] backdrop-blur"
      style={{ backgroundColor: "var(--app-background)" }}
    >
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CardTitle className="text-xl font-semibold text-white">Comments</CardTitle>
            <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-slate-200">
              {totalCount.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Button variant="ghost" size="sm" className="h-9 px-3 text-slate-300 hover:text-white">
              Top Holders
            </Button>
            <Button variant="ghost" size="sm" className="h-9 px-3 text-slate-300 hover:text-white">
              Activity
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-6">
        <div className="rounded-2xl p-2 bg-transparent">
          <textarea
            rows={3}
            value={drafts.root || ""}
            onChange={(e) => updateDraft("root", e.target.value)}
            placeholder={user ? "Type your comment..." : "Sign in to add a comment"}
            className="w-full bg-transparent border border-white/10 text-white placeholder:text-slate-500 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/70 resize-none"
            disabled={!user}
          />
          <div className="flex justify-end pt-3">
            <Button
              onClick={() => submitComment(null)}
              disabled={postingIds.root || !user}
              size="sm"
              className="px-6 bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-full shadow-lg shadow-blue-500/30"
            >
              {postingIds.root ? "Posting..." : "Post"}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="text-slate-400 text-sm">Filter</span>
            <div className="inline-flex rounded-full bg-white/10 border border-white/10 p-1">
              <button
                className={`px-4 py-1 text-sm rounded-full transition-colors ${
                  !holdersOnly ? "bg-white text-slate-900 shadow" : "text-slate-200 hover:text-white"
                }`}
                onClick={() => setHoldersOnly(false)}
                type="button"
              >
                All comments
              </button>
              <button
                className={`px-4 py-1 text-sm rounded-full transition-colors ${
                  holdersOnly ? "bg-white text-slate-900 shadow" : "text-slate-200 hover:text-white"
                }`}
                onClick={() => setHoldersOnly(true)}
                type="button"
              >
                Holders only
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-sm">Sort</span>
            <Select value={sort} onValueChange={(val) => setSort(val)}>
              <SelectTrigger className="w-36 bg-white/10 border border-white/15 text-white rounded-full px-4 py-2 h-10 focus:ring-2 focus:ring-blue-500/70">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent
                className="text-white border border-[#2f4b3c]"
                style={{ backgroundColor: "var(--app-background)" }}
              >
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto text-amber-300/90 text-sm flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <span>Beware of external links.</span>
          </div>
        </div>

        {error && <div className="text-red-400 text-sm">{error}</div>}
        {loading && comments.length === 0 ? (
          renderSkeletons()
        ) : filteredComments.length === 0 ? (
          <div className="text-slate-400">No comments yet.</div>
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
                parentUserName={null}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
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
  parentUserName = null,
  renderChildren = true,
}) {
  const [showHoldings, setShowHoldings] = useState(false)
  const hasMultipleHoldings = (comment.holdings || []).length > 1
  const draftKey = comment.id
  const replyDraft = drafts[draftKey] || ""

  const formatAmount = (value) => {
    if (value === null || value === undefined) return ""
    const str = String(value)
    if (!str.includes(".")) return str
    const trimmed = str.replace(/\.?0+$/, "")
    return trimmed || "0"
  }

  const primaryHolding = comment.holdings?.[0]
  const avatarUrl = comment.user?.avatar_url
  const displayInitial = (comment.user?.display_name || "U").slice(0, 1).toUpperCase()
  const buildFlatReplies = (items, parentName) => {
    if (!items?.length) return []
    const list = []
    items.forEach((item) => {
      list.push({ item, parentName })
      if (item.replies?.length) {
        list.push(...buildFlatReplies(item.replies, item.user?.display_name || "User"))
      }
    })
    return list
  }
  const flatReplies = renderChildren
    ? buildFlatReplies(comment.replies, comment.user?.display_name || "User")
    : []

  return (
    <div className="group relative p-4 rounded-xl transition-colors">
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
                  className="text-xs bg-emerald-500/15 text-emerald-200 px-2 py-1 rounded-full flex items-center gap-1 shadow-sm"
                  onClick={() => setShowHoldings((prev) => !prev)}
                >
                  <span>
                    {formatAmount(primaryHolding.cost_basis)} {primaryHolding.option_title || "Position"}
                  </span>
                  {hasMultipleHoldings && (showHoldings ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                </button>
                {hasMultipleHoldings && showHoldings && (
                  <div
                    className="absolute z-10 mt-2 w-64 rounded-lg shadow-lg p-3 space-y-2 border border-[#2f4b3c]"
                    style={{ backgroundColor: "var(--app-background)" }}
                  >
                    {comment.holdings.map((h, idx) => (
                      <div key={`${h.option_id}-${idx}`} className="text-xs text-gray-200 flex justify-between">
                        <span className="text-gray-300">{h.option_title || "Position"}</span>
                        <span className="text-gray-100">{formatAmount(h.cost_basis)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <span className="text-gray-500 text-xs">• {formatTimeAgo(comment.created_at)}</span>
          </div>
          <p className="text-slate-100 mt-2 leading-relaxed">
            {parentUserName ? <span className="text-blue-400 mr-2">@{parentUserName}</span> : null}
            {comment.content}
          </p>
          <div className="flex items-center gap-2 mt-3 text-gray-400">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-slate-300 hover:text-white"
              type="button"
            >
              <Heart className="w-4 h-4" />
              <span>Like</span>
            </Button>
            {user && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-slate-300 hover:text-white"
                onClick={() => {
                  setReplyTarget(draftKey)
                  updateDraft(draftKey, replyDraft || "")
                }}
                type="button"
              >
                <MessageSquare className="w-4 h-4" />
                Reply
              </Button>
            )}
          </div>

          {user && replyTarget === draftKey && (
            <div className="mt-3 space-y-3">
              <Textarea
                rows={2}
                value={replyDraft}
                onChange={(e) => updateDraft(draftKey, e.target.value)}
                placeholder="Reply to this comment..."
                className="bg-transparent text-white placeholder:text-slate-500 border border-white/15 rounded-xl focus-visible:ring-blue-500/70"
              />
              <div className="flex justify-end">
                <Button
                  onClick={() => submitComment(comment.id)}
                  disabled={postingIds[draftKey]}
                  size="sm"
                  className="px-5 bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-full shadow-lg shadow-blue-500/30"
                >
                  {postingIds[draftKey] ? "Posting..." : "Reply"}
                </Button>
              </div>
            </div>
          )}

          {flatReplies.length > 0 && (
            <div className="mt-4 space-y-3">
              {flatReplies.map(({ item: reply, parentName }) => (
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
                  parentUserName={parentName}
                  renderChildren={false}
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

