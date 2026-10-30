# Learn articles

Each article is one Markdown file in this folder. The file name becomes the web
address: `position-sizing.md` is published at `/learn/position-sizing`.

## Add an article

1. Copy `_template.md` to a new file with a short lowercase name, words joined
   by hyphens, for example `london-breakout-test.md`.
2. Fill in the header between the `---` lines and write the article below it.
3. Put any images in `public/learn/` and refer to them as `/learn/your-image.webp`.
4. Preview locally with `npm run dev` and open `http://localhost:3000/learn`.
5. Commit and deploy. The article appears on `/learn`, in the sitemap, and in
   "Keep reading" lists automatically.

The build stops with the file name and the problem if a header is wrong, so a
broken article never reaches the live site.

## Header fields

| Field | Required | Notes |
| --- | --- | --- |
| `title` | yes | The headline. |
| `description` | yes | One sentence for cards, search results and social previews. |
| `category` | yes | One of: Getting started, Backtesting, Journaling, Analytics, Risk, Chart tools, Strategy. |
| `date` | yes | Publish date, `YYYY-MM-DD`. Newest articles are listed first. |
| `updated` | no | Date of a later revision. Shown as "Updated …". |
| `author` | no | Defaults to ForexTestLab. |
| `cover` | no | Cover image path such as `/learn/sizing.webp` (1600×900 works well). Without one, a chart cover in the category colour is drawn. |
| `coverAlt` | no | Describes the cover for screen readers. |
| `featured` | no | `true` puts the article in the large slot at the top of `/learn`. Keep it on one article. |
| `draft` | no | `true` hides the article on the live site; it still shows in `npm run dev`. |
| `ctaLabel`, `ctaHref` | no | The button in the closing box. Defaults to "Start a free backtest" → `/app/backtest`. |
| `takeaways` | no | A list shown in a "Key takeaways" box above the article. |

## What you can write in the body

```markdown
## Section heading          (appears in "On this page")
### Smaller heading

A paragraph. **Bold**, *italic*, `code`, [a link](/pricing) or [an outside link](https://example.com).

- Bullet list
1. Numbered list

> [!TIP]
> A green tip box. Also [!NOTE] (blue) and [!WARNING] (amber).

| Scenario | Win rate | Expectancy |
| --- | --- | --- |
| Trend follower | 40% | +$12 |

![Describe the image](/learn/chart.webp "Caption shown under the image")
```

Raw HTML is not supported; it is shown as plain text.
