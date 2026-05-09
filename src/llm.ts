import { Article } from './types';

export async function generatePersonalizedSummary(
  article: Article,
  apiKey: string
): Promise<string> {
  try {
    const prompt = buildSummaryPrompt(article);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.content[0].text;
  } catch (error) {
    console.error('Error generating summary:', error);
    throw error;
  }
}

function buildSummaryPrompt(article: Article): string {
  const ratingText = article.rating
    ? `I rated this article ${article.rating}/5 stars.`
    : '';
  const notesText = article.notes
    ? `\n\nMy personal notes:\n${article.notes}`
    : '';

  return `Please create a personalized summary of the following article from my perspective as a researcher. ${ratingText}

Article Title: ${article.title}
Source: ${article.source}
Published: ${article.pubDate.toLocaleDateString()}

Article Content:
${article.content.slice(0, 4000)}
${notesText}

Create a summary that:
1. Captures the key insights and main points
2. Integrates my personal notes and perspective
3. Is written as if I'm explaining this to a colleague
4. Is concise but thorough (2-3 paragraphs)
5. Highlights why this matters based on my rating and notes

Format the summary in a way that's easy to share via email or messaging.`;
}
