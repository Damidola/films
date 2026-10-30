import { readYouTubeComments } from "../youtube-comments-reader.mjs";
export async function readTrailerReviews(
  work,
  videoId,
  fetchFn = fetch,
  signal,
) {
  const data = await readYouTubeComments(videoId, fetchFn, signal);
  return {
    ...data,
    schemaVersion: 1,
    workId: work.rank,
    provider: "youtube",
    source: {
      name: "YouTube",
      host: "youtube.com",
      url: "https://www.youtube.com/watch?v=" + videoId,
    },
    status:
      data.status === "disabled"
        ? "disabled"
        : data.comments.length
          ? "ok"
          : "empty",
  };
}
