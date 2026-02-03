# MurphDuel - Fantasy Football Leaderboards

A beautiful, responsive website for tracking FanDuel fantasy football leaderboards and champion history with Chicago Bears theme.

🏈 **Live Site:** https://murphduel.com  
🐻 **Theme:** Chicago Bears (Navy Blue & Orange)

## Features

✅ **Yearly Leaderboards** - Display final standings for each season  
✅ **Easy Score Upload** - Simple JSON file structure for adding new seasons  
✅ **Hall of Fame** - Track multiple-time champions  
✅ **Stats Dashboard** - Season count, total managers, champions, points  
✅ **Responsive Design** - Works great on mobile, tablet, and desktop  
✅ **Bears Themed** - Navy blue and orange color scheme  
✅ **Zero Dependencies** - Pure HTML/CSS/JavaScript  

## File Structure

```
murphduel/
├── index.html          # Main page
├── leaderboard.json    # League data (edit this to add seasons)
├── css/
│   └── style.css       # Styling (Bears theme)
├── CNAME               # Custom domain config
├── .gitignore
└── README.md
```

## How to Add New Seasons

Simply edit `leaderboard.json` and add a new season object to the `seasons` array:

```json
{
  "year": 2026,
  "description": "The epic battle continues...",
  "leaderboard": [
    {
      "manager": "Manager Name",
      "teamName": "Team Name",
      "points": 1850.50
    },
    {
      "manager": "Second Place",
      "teamName": "Second Team",
      "points": 1820.75
    }
  ]
}
```

### Fields:
- **year** - Season year (integer)
- **description** - Optional season description
- **leaderboard** - Array of managers with:
  - **manager** - Manager's name
  - **teamName** - Fantasy team name
  - **points** - Final points scored

The website automatically:
- Generates year selector buttons
- Displays medal emojis (🥇🥈🥉)
- Calculates statistics
- Updates Hall of Fame

## Local Development

```bash
# Python
python -m http.server 8000

# Node
npx serve
```

Visit `http://localhost:3000` (or the port shown)

## Customization

### Colors
Edit CSS variables in `css/style.css`:
```css
--primary: #0B162B;      /* Navy Blue */
--secondary: #C83803;    /* Orange */
--accent: #FFFFFF;       /* White */
--gold: #FFD700;         /* Gold accents */
```

### Fonts
Currently using Google Fonts (Playfair Display + Poppins). Change in `index.html` `<head>`.

### Branding
- Team name: "MurphDuel" (edit in index.html)
- Logo emoji: 🏈 (edit in navbar)
- Hall of Fame emoji: 👑 (edit in script)

## Deployment to GitHub Pages

### 1. Create Repository
```bash
git init
git add .
git commit -m "Initial commit: MurphDuel fantasy football website"
```

### 2. Push to GitHub
```bash
git remote add origin https://github.com/YOUR_USERNAME/murphduel.git
git branch -M main
git push -u origin main
```

### 3. Enable GitHub Pages
- Go to repo Settings → Pages
- Select "Deploy from branch"
- Choose "main" branch
- Save

### 4. Configure Custom Domain
- Go to Settings → Pages
- Under "Custom domain" enter: `murphduel.com`
- Update your domain's DNS records to point to GitHub Pages:

```
A Record @:
  185.199.108.153
  185.199.109.153
  185.199.110.153
  185.199.111.153

Or CNAME (if using subdomain):
  CNAME www → YOUR_USERNAME.github.io
```

## Data Management Best Practices

### Before Adding Scores
1. Verify all final points with your league
2. Double-check manager names for consistency
3. Ensure team names are unique

### Commit Message Format
```
git commit -m "Add 2026 final standings

- Champion: [Name] with [Points] points
- [Number] managers competed"
```

### Backup
Keep a backup of `leaderboard.json` locally in case of accidents.

## Future Features to Consider

- 📊 Historical charts and trends
- 🏆 Career statistics per manager
- 📈 Weekly standings during season
- 💬 Comments/celebration section
- 🎯 Live scoring integration
- 🐻 More Bears customization

## Troubleshooting

**Leaderboard not updating?**
- Make sure JSON is valid (use jsonlint.com)
- Clear browser cache (Ctrl+Shift+Delete)
- Check browser console for errors (F12)

**Custom domain not working?**
- DNS changes take 24-48 hours to propagate
- Verify DNS records are set correctly
- Check GitHub Pages settings

**Styling looks off?**
- Make sure `css/style.css` is loading
- Check file paths are relative
- Clear browser cache

## Browser Support

✅ Chrome/Edge (latest)  
✅ Firefox (latest)  
✅ Safari (latest)  
✅ Mobile browsers  

## License

MIT License - Use for your league!

---

**Go Bears! 🧡**

Made with 🏈 and ☕ for MurphDuel fantasy football.
