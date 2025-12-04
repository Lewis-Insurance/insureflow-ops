# Hostinger DNS Configuration for lewisinsurance.ai

## Overview
Configure your Hostinger DNS to point lewisinsurance.ai to Vercel hosting.

---

## Step-by-Step DNS Configuration

### Step 1: Log Into Hostinger
1. Go to [https://www.hostinger.com](https://www.hostinger.com)
2. Click **"Login"** (top right)
3. Enter your credentials
4. You should land on the Hostinger dashboard

### Step 2: Navigate to DNS Management
1. In the top menu, click **"Domains"**
2. Find **lewisinsurance.ai** in your domain list
3. Click **"Manage"** next to lewisinsurance.ai
4. Click **"DNS / Name Servers"** tab
5. Scroll down to **"DNS Records"** section
6. Click **"Manage"** (if present) or you should see the records directly

### Step 3: Remove Conflicting Records (If Present)

**Check for existing A records:**
- Look for any A record with Name: `@` or blank
- If present, click the **trash icon** to delete it

**Check for existing AAAA records:**
- Look for any AAAA (IPv6) records
- Delete any AAAA records pointing to the root domain

**Check for existing CNAME records:**
- Ensure there's no CNAME on the root domain (Name: `@`)
- This would conflict with the A record we're adding

### Step 4: Add Vercel A Record (Root Domain)

Click **"Add Record"** and enter:

```
Type: A
Name: @ (or leave blank if that's not an option)
Points to: 76.76.21.21
TTL: 14400 (or leave default)
```

**Explanation:**
- **Type A:** Points domain to an IP address
- **Name @:** Represents the root domain (lewisinsurance.ai)
- **76.76.21.21:** Vercel's Anycast IP address
- **TTL:** Time To Live (how long DNS caches this record)

Click **"Add Record"** or **"Save"**

### Step 5: Add Vercel CNAME Record (WWW Subdomain)

Click **"Add Record"** again and enter:

```
Type: CNAME
Name: www
Points to: cname.vercel-dns.com
TTL: 14400 (or leave default)
```

**Explanation:**
- **Type CNAME:** Creates an alias to another domain
- **Name www:** For www.lewisinsurance.ai
- **cname.vercel-dns.com:** Vercel's CNAME target
- This ensures www.lewisinsurance.ai redirects to lewisinsurance.ai

Click **"Add Record"** or **"Save"**

### Step 6: Verify DNS Records

Your DNS records should now look like this:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | 76.76.21.21 | 14400 |
| CNAME | www | cname.vercel-dns.com | 14400 |

**Keep existing records:**
- MX records (for email) - DO NOT delete
- TXT records (for domain verification) - DO NOT delete
- Any other records you're using - Leave them

### Step 7: Wait for DNS Propagation

**Timeline:**
- Minimum: 5 minutes
- Typical: 15-30 minutes
- Maximum: 48 hours (rare)

**During this time:**
- Don't make additional changes
- Don't panic if domain doesn't work immediately
- DNS changes propagate globally gradually

### Step 8: Check DNS Propagation

Use online tools to verify DNS is propagating:

**Option 1: whatsmydns.net**
1. Go to [https://www.whatsmydns.net](https://www.whatsmydns.net)
2. Enter: `lewisinsurance.ai`
3. Select: `A` record type
4. Click **"Search"**
5. Should show `76.76.21.21` in green checkmarks globally

**Option 2: Command Line (Mac/Linux)**
```bash
# Check A record
dig lewisinsurance.ai

# Expected output should include:
# lewisinsurance.ai.  14400  IN  A  76.76.21.21

# Check CNAME record
dig www.lewisinsurance.ai

# Expected output should include:
# www.lewisinsurance.ai.  14400  IN  CNAME  cname.vercel-dns.com.
```

**Option 3: Command Line (Windows)**
```cmd
# Check A record
nslookup lewisinsurance.ai

# Should show:
# Address: 76.76.21.21
```

### Step 9: Verify in Vercel

1. Go to Vercel Dashboard: [https://vercel.com/dashboard](https://vercel.com/dashboard)
2. Click on your **insureflow-ops** project
3. Click **"Settings"** → **"Domains"**
4. Check status of lewisinsurance.ai

**Should show:**
- ✅ **Valid Configuration**
- ✅ **SSL Certificate: Active**

**If still showing "Invalid Configuration":**
- Wait 10-15 more minutes
- Click **"Refresh"** button in Vercel
- Check DNS propagation again

### Step 10: Test the Domain

**Browser Test:**
1. Open a new incognito/private browser window
2. Go to: `https://lewisinsurance.ai`
3. Should load your InsureFlow Ops application
4. Check for SSL padlock (🔒) in address bar

**Test WWW redirect:**
1. Go to: `https://www.lewisinsurance.ai`
2. Should redirect to `https://lewisinsurance.ai`

**Test HTTP to HTTPS:**
1. Go to: `http://lewisinsurance.ai`
2. Should automatically redirect to `https://lewisinsurance.ai`

---

## Troubleshooting

### Issue: "This site can't be reached" Error

**Possible Causes:**
1. DNS not propagated yet → Wait 15-30 minutes
2. Wrong DNS records → Double-check A record IP: `76.76.21.21`
3. Records not saved → Verify they appear in Hostinger DNS list

**Solution:**
- Clear browser cache (Ctrl+Shift+Delete or Cmd+Shift+Delete)
- Try different browser or incognito mode
- Use whatsmydns.net to check propagation
- Wait longer (DNS can take up to 48 hours in rare cases)

### Issue: "SSL Certificate Pending" in Vercel

**Possible Causes:**
1. DNS not verified yet
2. Vercel waiting for DNS propagation

**Solution:**
- Vercel automatically provisions SSL after DNS is verified
- Wait 15-30 minutes
- If stuck after 1 hour, try removing and re-adding domain in Vercel
- Click "Refresh" button in Vercel domains page

### Issue: Domain Shows "Invalid Configuration" in Vercel

**Possible Causes:**
1. DNS records incorrect
2. CNAME on root domain (conflicts with A record)
3. Propagation still in progress

**Solution:**
- Verify A record exactly: `76.76.21.21` (not 76.76.21.22 or similar)
- Ensure no CNAME record on `@` (root)
- Wait for full propagation
- Use `dig` or `nslookup` to verify DNS resolves correctly

### Issue: Old Website Still Showing

**Cause:** Browser cache or DNS cache

**Solution:**
```bash
# Mac/Linux - Flush DNS cache
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder

# Windows - Flush DNS cache
ipconfig /flushdns

# Then clear browser cache:
# Chrome: Ctrl+Shift+Delete → Clear cached images and files
# Safari: Cmd+Option+E
# Firefox: Ctrl+Shift+Delete → Cache
```

### Issue: SSL Certificate Error / Not Secure Warning

**Possible Causes:**
1. SSL provisioning still in progress
2. Mixed content (HTTP resources on HTTPS page)

**Solution:**
- Wait 15-30 minutes for Vercel SSL provisioning
- Check Vercel → Settings → Domains → SSL status
- If persists after 1 hour, contact Vercel support
- Ensure all resources in your app use HTTPS (check browser console)

### Issue: WWW Not Redirecting

**Cause:** CNAME record missing or incorrect

**Solution:**
- Verify CNAME record exists: `www` → `cname.vercel-dns.com`
- Wait for DNS propagation
- Check with: `dig www.lewisinsurance.ai`
- Ensure Vercel has both `lewisinsurance.ai` and `www.lewisinsurance.ai` configured

---

## Advanced Configuration (Optional)

### Add Subdomain (e.g., app.lewisinsurance.ai)

If you want to host the app on a subdomain:

**In Hostinger:**
```
Type: CNAME
Name: app
Points to: cname.vercel-dns.com
TTL: 14400
```

**In Vercel:**
1. Settings → Domains → Add
2. Enter: `app.lewisinsurance.ai`
3. Follow verification steps

### Add Email Records (If Using Email)

**Don't delete existing email records:**
- MX records (mail routing)
- TXT records (SPF, DKIM, DMARC)

**If you need to add email:**
```
Type: MX
Name: @
Priority: 10
Points to: mail.lewisinsurance.ai (or your email provider)
```

### CAA Record (Optional Security)

Add Certificate Authority Authorization:

```
Type: CAA
Name: @
Value: 0 issue "letsencrypt.org"
```

This restricts which CAs can issue SSL certificates for your domain.

---

## DNS Record Reference

### Final DNS Configuration

Your complete DNS setup should look like this:

```
Type    | Name  | Value                    | Priority | TTL
--------|-------|--------------------------|----------|--------
A       | @     | 76.76.21.21             | -        | 14400
CNAME   | www   | cname.vercel-dns.com    | -        | 14400
MX      | @     | mail.example.com        | 10       | 14400 (if using email)
TXT     | @     | "v=spf1..."             | -        | 14400 (if using email)
```

---

## Summary Checklist

- [ ] Logged into Hostinger
- [ ] Navigated to lewisinsurance.ai DNS settings
- [ ] Deleted conflicting records (if any)
- [ ] Added A record: `@` → `76.76.21.21`
- [ ] Added CNAME record: `www` → `cname.vercel-dns.com`
- [ ] Saved changes
- [ ] Waited 15-30 minutes for propagation
- [ ] Verified DNS with whatsmydns.net or dig
- [ ] Checked Vercel shows "Valid Configuration"
- [ ] Tested https://lewisinsurance.ai in browser
- [ ] Verified SSL certificate is active (🔒 padlock)
- [ ] Tested www redirect works
- [ ] Confirmed HTTP redirects to HTTPS

---

## Next Steps

After DNS is configured and propagated:

1. Return to **VERCEL_DEPLOYMENT_GUIDE.md**
2. Continue with **Part 6: Deploy Supabase Edge Functions**
3. Complete final verification and testing

---

## Need Help?

**Common Resources:**
- Hostinger Support: [https://www.hostinger.com/support](https://www.hostinger.com/support)
- Vercel Docs on Custom Domains: [https://vercel.com/docs/concepts/projects/domains](https://vercel.com/docs/concepts/projects/domains)
- DNS Propagation Checker: [https://www.whatsmydns.net](https://www.whatsmydns.net)

**If DNS isn't working after 48 hours:**
1. Screenshot your Hostinger DNS records
2. Screenshot Vercel domain configuration
3. Contact Hostinger support with screenshots
4. They can verify DNS is configured correctly on their end
