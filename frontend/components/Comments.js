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
import { useTranslations } from "next-intl"

const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

export default function Comments({ marketId, user, openAuthModal }) {
  const t = useTranslations("comments")
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
    <Card className="text-slate-900 shadow-none border-0 lg:shadow-md lg:border lg:border-[#e6ddcb] bg-[#446f55] lg:bg-[#f9f6ee] rounded-none lg:rounded-2xl">
      <CardHeader className="pb-4 px-4 lg:px-6">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-xl font-semibold text-white lg:text-slate-900">{t("title")}</CardTitle>
          <span className="rounded-full bg-gray-700 lg:bg-white px-3 py-1 text-sm text-white lg:text-slate-800 border-0 lg:border lg:border-[#e6ddcb]">
            {totalCount.toLocaleString()}
          </span>
        </div>

        {/* Mobile Tabs */}
        <div className="flex gap-6 mt-4 lg:hidden border-b border-gray-700">
          <button className="pb-3 border-b-2 border-blue-500 text-white font-medium text-sm">
            Comments
          </button>
          <button className="pb-3 text-gray-400 hover:text-white text-sm transition-colors">
            Holders
          </button>
          <button className="pb-3 text-gray-400 hover:text-white text-sm transition-colors">
            Activity
          </button>
        </div>

        {/* Desktop Tabs */}
        <div className="hidden lg:flex items-center gap-2 text-sm text-slate-700 mt-2">
          <Button variant="ghost" size="sm" className="h-9 px-3 text-slate-700 hover:text-slate-900">
            {t("topHolders")}
          </Button>
          <Button variant="ghost" size="sm" className="h-9 px-3 text-slate-700 hover:text-slate-900">
            {t("activity")}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4 px-4 lg:px-6">
        <div className="lg:rounded-2xl p-0 lg:p-2 bg-transparent">
          <textarea
            rows={3}
            value={drafts.root || ""}
            onChange={(e) => updateDraft("root", e.target.value)}
            placeholder={user ? t("placeholder") : t("placeholderSignIn")}
            className="w-full bg-[#3a5f4a] lg:bg-white border-0 lg:border lg:border-[#e6ddcb] text-white lg:text-slate-900 placeholder:text-gray-400 lg:placeholder:text-slate-500 px-4 py-3 rounded-lg lg:rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 lg:focus:ring-[#4b6ea9]/60 resize-none"
            disabled={!user}
          />
          <div className="flex justify-end items-center pt-3">
            <Button
              onClick={() => submitComment(null)}
              disabled={postingIds.root || !user}
              size="sm"
              className="px-6 bg-[#4b6ea9] hover:bg-[#3f5e9c] disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-full shadow-sm"
            >
              {postingIds.root ? t("posting") : t("submit")}
            </Button>
          </div>
        </div>

        {/* Warning Banner - Mobile */}
        <div className="lg:hidden bg-[#3a5f4a] text-gray-300 rounded-lg p-3 flex items-center gap-2 text-sm">
          <span className="text-lg">🛡️</span>
          <span>Beware of external links.</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            className={`px-4 py-2 text-sm rounded-full font-medium transition-colors ${
              !holdersOnly ? "bg-gray-700 text-white" : "bg-transparent text-gray-400 border border-gray-700"
            }`}
            onClick={() => setHoldersOnly(false)}
            type="button"
          >
            Newest
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={holdersOnly}
              onChange={(e) => setHoldersOnly(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500"
            />
            <span className="text-gray-300 lg:text-slate-700">Holders</span>
          </label>
        </div>

        {error && <div className="text-red-400 text-sm">{error}</div>}
        {loading && comments.length === 0 ? (
          renderSkeletons()
        ) : filteredComments.length === 0 ? (
          <div className="text-gray-400 lg:text-slate-700">{t("noComments")}</div>
        ) : (
          <div className="space-y-3">
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
    <div className="group relative p-4 rounded-none lg:rounded-xl transition-colors bg-[#3a5f4a] lg:bg-white border-0 lg:border lg:border-[#e6ddcb]">
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
            <span className="text-white lg:text-slate-900 font-medium">{comment.user?.display_name || "User"}</span>
            {primaryHolding && (
              <div className="relative">
                <button
                  className="text-xs bg-emerald-900 lg:bg-emerald-100 text-emerald-300 lg:text-emerald-800 px-2 py-1 rounded-full flex items-center gap-1 shadow-sm border border-emerald-800 lg:border-emerald-200"
                  onClick={() => setShowHoldings((prev) => !prev)}
                >
                  <span>
                    {formatAmount(primaryHolding.cost_basis)} {primaryHolding.option_title || "Position"}
                  </span>
                  {hasMultipleHoldings && (showHoldings ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                </button>
                {hasMultipleHoldings && showHoldings && (
                  <div className="absolute z-10 mt-2 w-64 rounded-lg shadow-lg p-3 space-y-2 border border-gray-700 lg:border-[#e6ddcb] bg-[#3a5f4a] lg:bg-white">
                    {comment.holdings.map((h, idx) => (
                      <div key={`${h.option_id}-${idx}`} className="text-xs text-white lg:text-slate-900 flex justify-between">
                        <span className="text-gray-300 lg:text-slate-800">{h.option_title || "Position"}</span>
                        <span className="text-white lg:text-slate-900 font-semibold">{formatAmount(h.cost_basis)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <span className="text-gray-400 lg:text-slate-600 text-xs">• {formatTimeAgo(comment.created_at)}</span>
          </div>
          <p className="text-gray-200 lg:text-slate-900 mt-2 leading-relaxed">
            {parentUserName ? <span className="text-blue-400 lg:text-[#3f5e9c] mr-2">@{parentUserName}</span> : null}
            {comment.content}
          </p>
          <div className="flex items-center gap-2 mt-3 text-gray-400 lg:text-slate-700">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-gray-400 lg:text-slate-700 hover:text-white lg:hover:text-slate-900"
              type="button"
            >
              <Heart className="w-4 h-4" />
              <span>0</span>
            </Button>
            {user && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-gray-400 lg:text-slate-700 hover:text-white lg:hover:text-slate-900"
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
                className="bg-[#3a5f4a] lg:bg-white text-white lg:text-slate-900 placeholder:text-gray-400 lg:placeholder:text-slate-500 border-0 lg:border lg:border-[#e6ddcb] rounded-xl focus-visible:ring-blue-500 lg:focus-visible:ring-[#4b6ea9]/60"
              />
              <div className="flex justify-end">
                <Button
                  onClick={() => submitComment(comment.id)}
                  disabled={postingIds[draftKey]}
                  size="sm"
                  className="px-5 bg-[#4b6ea9] hover:bg-[#3f5e9c] text-white font-semibold rounded-full shadow-sm"
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

