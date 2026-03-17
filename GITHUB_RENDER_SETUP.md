# SocialEra GitHub + Render Setup

## 1. Create a GitHub repo

Create an empty repo on GitHub first, then run these commands from:

`/Users/dansangil/Desktop/Lovada`

```bash
git init
git add .
git commit -m "Prepare SocialEra for launch"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

## 2. Create the Render app

In Render:

1. Click `New +`
2. Choose `Blueprint`
3. Connect your GitHub repo
4. Render will detect [`/Users/dansangil/Desktop/Lovada/render.yaml`](/Users/dansangil/Desktop/Lovada/render.yaml)

## 3. Set environment variables in Render

Use these values:

- `PORT` = `10000`
- `ADMIN_USERNAME` = your admin username
- `ADMIN_PASSWORD` = a strong password

## 4. Update Supabase

In Supabase Auth settings, add your Render domain to:

- Site URL
- Redirect URLs

Example:

- `https://your-socialera-app.onrender.com`

## 5. Final launch check

Verify:

- homepage loads
- products load
- signup works
- login works
- account page loads
- checkout prefills saved shipping data
- admin login works
- admin product create/edit/delete works
