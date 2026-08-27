import { logProxyError } from "@/app/lib/utils/proxyError";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get('period') || '7days') as '7days' | '30days';

    if (!['7days', '30days'].includes(period)) {
      return new Response(
        JSON.stringify({ error: 'Invalid period. Use 7days or 30days' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const days = period === '7days' ? 7 : 30;
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const mockConfessions = [
      { id: '1', content: 'I love coding late at night when the world is quiet', createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), reactions: { like: 45, love: 32 } },
      { id: '2', content: 'Sometimes I pretend to work but I am actually learning new tech', createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), reactions: { like: 38, love: 28 } },
      { id: '3', content: 'I talk to my rubber duck more than real people during debugging', createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), reactions: { like: 52, love: 41 } },
      { id: '4', content: 'I still google basic syntax after 5 years of programming', createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), reactions: { like: 67, love: 55 } },
      { id: '5', content: 'My best debugging tool is taking a walk outside', createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), reactions: { like: 44, love: 36 } },
      { id: '6', content: 'I name my variables after my favorite foods and drinks', createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000), reactions: { like: 29, love: 18 } },
      { id: '7', content: 'Coffee is my primary coding language everything else is secondary', createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), reactions: { like: 71, love: 63 } },
      { id: '8', content: 'I have imposter syndrome daily even after successful projects', createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), reactions: { like: 88, love: 72 } },
      { id: '9', content: 'Stack Overflow literally saved my career multiple times', createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), reactions: { like: 95, love: 81 } },
      { id: '10', content: 'I write detailed comments for my future self who will forget everything', createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), reactions: { like: 41, love: 33 } },
    ];

    const trending = mockConfessions
      .filter(c => new Date(c.createdAt) >= cutoffDate)
      .map(c => ({
        id: c.id,
        content: c.content,
        createdAt: c.createdAt.toISOString(),
        reactionCount: c.reactions.like + c.reactions.love,
        reactions: c.reactions
      }))
      .sort((a, b) => b.reactionCount - a.reactionCount)
      .slice(0, 10);

    const totalLikes = trending.reduce((sum, c) => sum + c.reactions.like, 0);
    const totalLoves = trending.reduce((sum, c) => sum + c.reactions.love, 0);
    const total = totalLikes + totalLoves;

    const reactionDistribution = [
      {
        type: 'like',
        count: totalLikes,
        percentage: total > 0 ? Math.round((totalLikes / total) * 100) : 0
      },
      {
        type: 'love',
        count: totalLoves,
        percentage: total > 0 ? Math.round((totalLoves / total) * 100) : 0
      }
    ];

    const dailyActivity = [];
    const now = Date.now();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now - i * 24 * 60 * 60 * 1000);
      dailyActivity.push({
        date: date.toISOString().split('T')[0],
        confessions: Math.floor(Math.random() * 50) + 10,
        reactions: Math.floor(Math.random() * 150) + 50,
        activeUsers: Math.floor(Math.random() * 100) + 20
      });
    }

    const totalMetrics = {
      totalConfessions: trending.length,
      totalReactions: trending.reduce((sum, c) => sum + c.reactionCount, 0),
      totalUsers: Math.floor(trending.reduce((sum, c) => sum + c.reactionCount, 0) * 0.6)
    };

    const analytics = {
      trending,
      reactionDistribution,
      dailyActivity,
      totalMetrics,
      period
    };

    return new Response(JSON.stringify(analytics), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=900'
      }
    });
  } catch (error) {
    logProxyError("Error computing trending analytics", { route: "GET /api/analytics/trending" }, error);
    return new Response(JSON.stringify({ error: "Failed to fetch analytics" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
