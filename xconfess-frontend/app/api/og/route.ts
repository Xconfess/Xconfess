import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import React from 'react';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const text = searchParams.get('text') || 'Anonymous Confession';
    const truncated = text.length > 150 ? text.substring(0, 147) + '...' : text;

    return new ImageResponse(
      React.createElement(
        'div',
        {
          style: {
            background: 'linear-gradient(to bottom right, #1e293b, #0f172a)',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px',
          },
        },
        React.createElement(
          'div',
          {
            style: {
              background: 'white',
              borderRadius: '20px',
              padding: '40px',
              maxWidth: '900px',
              display: 'flex',
              flexDirection: 'column',
            },
          },
          React.createElement(
            'div',
            {
              style: {
                fontSize: 32,
                fontWeight: 'bold',
                color: '#1e293b',
                marginBottom: '20px',
              },
            },
            'XConfess',
          ),
          React.createElement(
            'div',
            {
              style: {
                fontSize: 24,
                color: '#475569',
                lineHeight: 1.5,
              },
            },
            truncated,
          ),
        ),
      ),
      {
        width: 1200,
        height: 630,
      },
    );
  } catch (e: any) {
    return new Response(`Failed to generate image: ${e.message}`, {
      status: 500,
    });
  }
}
