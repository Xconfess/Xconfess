import { createApiErrorResponse } from "@/lib/apiErrorHandler";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get('period') || '7days') as '7days' | '30days';

    // Validate period
    if (!['7days', '30days'].includes(period)) {
      return createApiErrorResponse('Invalid period. Use 7days or 30days', { status: 400 });
    }

    const days = period === '7days' ? 7 : 30;
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Mock data - replace with actual database queries
    const mockConfessions = [
      { id: '1', content: 'I love coding late at night', createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), reactions: { like: 45, love: 32 } },
      { id: '2', content: 'Sometimes I pretend to work but I\'m actually learning', createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), reactions: { like: 38, love: 28 } },
      { id: '3', content: 'I talk to my rubber duck more than real people', createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), reactions: { like: 52, love: 41 } },
      { id: '4', content: 'I still google basic syntax after 5 years', createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), reactions: { like: 67, love: 55 } },
      { id: '5', content: 'My best debugging tool is taking a walk', createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), reactions: { like: 44, love: 36 } },
      { id: '6', content: 'I name my variables after my favorite foods', createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000), reactions: { like: 29, love: 18 } },
      { id: '7', content: 'Coffee is my primary coding language', createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), reactions: { like: 71, love: 63 } },
      { id: '8', content: 'I have imposter syndrome daily', createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), reactions: { like: 88, love: 72 } },
      { id: '9', content: 'Stack Overflow saved my career', createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), reactions: { like: 95, love: 81 } },
      { id: '10', content: 'I write comments for my future self', createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), reactions: { like: 41, love: 33 } },
    ];

    // Get trending confessions
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

    // Calculate reaction distribution
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

    // Generate daily activity
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

    // Calculate total metrics
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
        'Cache-Control': 'public, max-age=900' // 15 minutes cache
      }
    });
  } catch (error) {
    return createApiErrorResponse(error, {
      status: 500,
      fallbackMessage: "Failed to fetch analytics",
      route: "GET /api/trending"
    });
  }
}
