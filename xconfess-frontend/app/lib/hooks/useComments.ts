"use client";

import { useMemo } from "react";
import type { InfiniteData } from "@tanstack/react-query";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createComment,
  getComments,
  type CreateCommentParams,
  type GetCommentsResult,
} from "@/app/lib/api/comments";
import {
  restoreQuerySnapshots,
  snapshotConfessionQueries,
  updateConfessionQueries,
} from "@/app/lib/api/confessionCache";
import { queryKeys } from "@/app/lib/api/queryKeys";
import type { Comment } from "@/app/lib/types/confession";

const DEFAULT_LIMIT = 10;

function ensureCommentPages(
  data: InfiniteData<GetCommentsResult> | undefined,
): InfiniteData<GetCommentsResult> {
  if (data) {
    return data;
  }

  return {
    pageParams: [1],
    pages: [{ comments: [], hasMore: false }],
  };
}

function upsertOptimisticComment(
  data: InfiniteData<GetCommentsResult> | undefined,
  optimisticComment: Comment,
): InfiniteData<GetCommentsResult> {
  const current = ensureCommentPages(data);
  const [firstPage, ...restPages] = current.pages;

  return {
    ...current,
    pages: [
      {
        ...firstPage,
        comments:
          optimisticComment.parentId == null
            ? [optimisticComment, ...firstPage.comments]
            : [...firstPage.comments, optimisticComment],
      },
      ...restPages,
    ],
  };
}

function replaceCommentById(
  data: InfiniteData<GetCommentsResult> | undefined,
  commentId: number,
  replacement: Comment,
): InfiniteData<GetCommentsResult> | undefined {
  if (!data) {
    return data;
  }

  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      comments: page.comments.map((comment) =>
        comment.id === commentId ? replacement : comment,
      ),
    })),
  };
}

function dedupeComments(comments: Comment[]): Comment[] {
  const seen = new Set<number>();

  return comments.filter((comment) => {
    if (seen.has(comment.id)) {
      return false;
    }

    seen.add(comment.id);
    return true;
  });
}

export function useCommentsQuery(confessionId: string, limit = DEFAULT_LIMIT) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.comments.byConfession(confessionId),
    queryFn: async ({ pageParam }) => {
      const result = await getComments(confessionId, {
        page: pageParam,
        limit,
      });

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      return result.data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.length + 1 : undefined,
    enabled: Boolean(confessionId),
  });

  const comments = useMemo(
    () =>
      dedupeComments(
        query.data?.pages.flatMap((page) => page.comments) ?? [],
      ),
    [query.data],
  );

  return {
    ...query,
    comments,
    hasMore: query.hasNextPage,
    loading: query.isLoading,
  };
}

export function useCreateCommentMutation(confessionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: CreateCommentParams) => {
      const result = await createComment(confessionId, variables);

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      return result.data;
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.comments.byConfession(confessionId),
      });

      const previousComments = queryClient.getQueryData<
        InfiniteData<GetCommentsResult>
      >(queryKeys.comments.byConfession(confessionId));
      const previousConfessionQueries = snapshotConfessionQueries(queryClient);

      const optimisticComment: Comment = {
        id: -Date.now(),
        content: variables.content.trim(),
        createdAt: new Date().toISOString(),
        author: "You",
        confessionId,
        parentId: variables.parentId ?? null,
        replies: [],
        isOptimistic: true,
      };

      queryClient.setQueryData<InfiniteData<GetCommentsResult>>(
        queryKeys.comments.byConfession(confessionId),
        (current) => upsertOptimisticComment(current, optimisticComment),
      );

      updateConfessionQueries(queryClient, confessionId, (confession) => ({
        ...confession,
        commentCount: (confession.commentCount ?? 0) + 1,
      }));

      return {
        optimisticCommentId: optimisticComment.id,
        previousComments,
        previousConfessionQueries,
      };
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(
        queryKeys.comments.byConfession(confessionId),
        context?.previousComments,
      );
      restoreQuerySnapshots(queryClient, context?.previousConfessionQueries);
    },
    onSuccess: (comment, _variables, context) => {
      queryClient.setQueryData<InfiniteData<GetCommentsResult>>(
        queryKeys.comments.byConfession(confessionId),
        (current) =>
          replaceCommentById(current, context?.optimisticCommentId ?? 0, comment),
      );

      queryClient.invalidateQueries({
        queryKey: queryKeys.comments.byConfession(confessionId),
        exact: true,
      });
    },
  });
}
