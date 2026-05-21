# Canvas Theme Editor

Parent: [Canvas Design Knowledge Base](../README.md)
Related: [CSS Inline Strategy](../01-canvas-rce/CSS-Inline-Strategy.md)

Official guide: [How do I upload custom JavaScript and CSS files to an account?](https://community.instructure.com/en/kb/articles/661411-how-do-i-upload-custom-javascript-and-css-files-to-an-account)

## What It Is

The Canvas Theme Editor is an admin-level feature for applying global CSS and JavaScript across a Canvas account or sub-account. Individual instructors normally cannot change it, but they may benefit from institution-provided classes if their Canvas administrators have added them.

Canvas Design Studio does not require Theme Editor access. Generated pages should work through the ordinary Rich Content Editor using inline CSS and Canvas-safe HTML.

## What Theme Editor Can Add

| Feature | In normal RCE content | With admin theme CSS/JS |
|---|---|---|
| `box-shadow` | Stripped | Possible through a class |
| Web fonts | Stripped if loaded from content | Possible globally |
| CSS animations | Stripped | Possible through a class |
| JavaScript interactions | Stripped | Possible globally |
| Institution-wide utility classes | Only built-in Canvas classes | Possible if admins add them |

## How Instructors Can Use Existing Theme Classes

If your Canvas admin has added CSS classes, you can usually reference those class names in RCE HTML:

```html
<div class="institution-callout">
  Your content here.
</div>
```

The styling works because the CSS lives in the account theme, not inside the page body. If you do not know whether your institution has theme classes, ask your Canvas admin or instructional design team.

## Production Guidance

Use Theme Editor classes only when they are already part of your institution's Canvas environment. For reusable Canvas Design Studio output, prefer inline CSS and Canvas built-in classes so pages remain portable across courses and institutions.

See also: [Canvas Built-In CSS Classes](../01-canvas-rce/Canvas-Built-In-CSS-Classes.md)
