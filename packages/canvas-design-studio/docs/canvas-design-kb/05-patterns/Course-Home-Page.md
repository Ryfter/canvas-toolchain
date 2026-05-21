# Course Home Page Pattern

Parent: [Canvas Design Knowledge Base](../README.md)
Related: [Component Library](../03-design-systems/Component-Library.md)

---

## Purpose

The course home page is the first thing students see when they enter your course. It should accomplish four things:

1. **Orient** — confirm they're in the right course, right semester
2. **Inform** — surface what's happening right now
3. **Navigate** — provide quick paths to the most-needed areas
4. **Reduce anxiety** — make the course feel organized and approachable

---

## Anatomy of a Strong Course Home Page

```
┌─────────────────────────────────────────┐
│  [Navigation Bar]                        │
│  Home | Modules | Assignments | ...      │
├─────────────────────────────────────────┤
│  [Hero Banner]                           │
│  Course name, semester, CTA buttons      │
├─────────────────────────────────────────┤
│  [Current Week Callout]                  │
│  What's active right now + deadline      │
├─────────────────────────────────────────┤
│  [Section Header]                        │
│  "What you'll learn" or "Course tracks"  │
│  [3-column Card Grid]                    │
│  Major themes / capabilities / units     │
├─────────────────────────────────────────┤
│  [Section Header]                        │
│  "Recent & upcoming weeks"               │
│  [Week Rows] × 3–4                       │
│  Past (complete) / Current / Upcoming    │
├─────────────────────────────────────────┤
│  [Two-Column Split]                      │
│  Learning Objectives | Deadlines         │
├─────────────────────────────────────────┤
│  [Footer Bar]                            │
│  Office hours + contact link             │
└─────────────────────────────────────────┘
```

---

## Full HTML Template

Copy this into the Canvas RCE HTML view. Replace all placeholder text.

```html
<div style="max-width: 860px; margin: 0 auto; font-family: Lato, sans-serif; color: #1A1A1A;">

  <!-- Navigation Bar -->
  <div style="display: flex; flex-wrap: wrap; margin-bottom: 24px;">
    <a href="/courses/COURSE_ID" style="font-size: 13px; font-weight: 600; padding: 7px 16px; border-radius: 7px; text-decoration: none; color: #fff; background: #0F6E56; margin-right: 6px; margin-bottom: 6px;">Home</a>
    <a href="/courses/COURSE_ID/modules" style="font-size: 13px; font-weight: 500; padding: 7px 16px; border-radius: 7px; text-decoration: none; color: #444; background: #F4F3EF; margin-right: 6px; margin-bottom: 6px;">Modules</a>
    <a href="/courses/COURSE_ID/assignments" style="font-size: 13px; font-weight: 500; padding: 7px 16px; border-radius: 7px; text-decoration: none; color: #444; background: #F4F3EF; margin-right: 6px; margin-bottom: 6px;">Assignments</a>
    <a href="/courses/COURSE_ID/discussion_topics" style="font-size: 13px; font-weight: 500; padding: 7px 16px; border-radius: 7px; text-decoration: none; color: #444; background: #F4F3EF; margin-right: 6px; margin-bottom: 6px;">Discussions</a>
    <a href="/courses/COURSE_ID/grades" style="font-size: 13px; font-weight: 500; padding: 7px 16px; border-radius: 7px; text-decoration: none; color: #444; background: #F4F3EF; margin-right: 6px; margin-bottom: 6px;">Grades</a>
  </div>

  <!-- Hero Banner -->
  <div style="background: linear-gradient(135deg, #085041 0%, #0F6E56 60%, #1D9E75 100%); border-radius: 14px; padding: 48px 48px 40px; margin-bottom: 28px; overflow: hidden;">
    <span style="display: inline-block; background: rgba(255,255,255,0.18); color: #fff; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; padding: 4px 12px; border-radius: 20px; margin-bottom: 14px;">Spring 2026 · ITM 370</span>
    <h2 style="font-family: Lato, sans-serif; font-size: 2rem; color: #fff; margin: 0 0 10px; line-height: 1.2;">AI Augmented Projects</h2>
    <p style="color: rgba(255,255,255,0.85); font-size: 15px; line-height: 1.65; max-width: 520px; margin: 0 0 24px;">Master modern AI tools and harnesses to build smarter workflows, automate processes, and create business value — no prior ML background required.</p>
    <a href="/courses/COURSE_ID/modules" style="display: inline-block; background: #fff; color: #0F6E56; font-size: 13px; font-weight: 600; padding: 10px 22px; border-radius: 8px; text-decoration: none; margin-right: 10px;">View Modules</a>
    <a href="/courses/COURSE_ID/assignments/syllabus" style="display: inline-block; border: 1.5px solid rgba(255,255,255,0.5); color: #fff; font-size: 13px; font-weight: 500; padding: 9px 22px; border-radius: 8px; text-decoration: none;">Syllabus</a>
  </div>

  <!-- Current Week Callout -->
  <div style="border-left: 3px solid #0F6E56; background: #e1f5ee; padding: 14px 18px; border-radius: 0 8px 8px 0; margin-bottom: 28px;">
    <strong style="font-size: 13px; color: #085041; display: block; margin-bottom: 4px;">Week 14 is live!</strong>
    <span style="font-size: 13px; color: #0F6E56; line-height: 1.6;">Agentic workflows and multi-step automation are now unlocked. Check the module for your Lab deliverable — <strong>due Sunday 11:59 PM</strong>.</span>
  </div>

  <!-- Section Header: Course At a Glance -->
  <div style="margin-bottom: 16px;">
    <p style="font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #0F6E56; margin: 0 0 6px;">Course at a glance</p>
    <h2 style="font-size: 1.4rem; font-weight: 600; margin: 0 0 4px; color: #1A1A1A;">What you'll build this semester</h2>
    <p style="font-size: 14px; color: #666; margin: 0 0 16px;">Four capability tracks, each delivering a real artifact.</p>
  </div>

  <!-- 3-Column Card Grid -->
  <div style="display: flex; flex-wrap: wrap; margin-right: -14px; margin-bottom: 28px;">
    <div style="flex: 1; min-width: 200px; margin-right: 14px; margin-bottom: 14px; background: #fff; border: 1px solid #e0e0d8; border-radius: 10px; padding: 18px 20px;">
      <div style="width: 36px; height: 36px; border-radius: 8px; background: #e1f5ee; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; font-size: 18px;">🧠</div>
      <h4 style="font-size: 14px; font-weight: 600; margin: 0 0 6px; color: #1A1A1A;">AI Harnesses</h4>
      <p style="font-size: 13px; color: #666; line-height: 1.55; margin: 0;">Design prompt systems and orchestration layers that wrap LLMs for repeatable business tasks.</p>
      <a href="#" style="font-size: 12px; color: #0F6E56; font-weight: 500; display: inline-block; margin-top: 10px; text-decoration: none;">→ Start here</a>
    </div>
    <div style="flex: 1; min-width: 200px; margin-right: 14px; margin-bottom: 14px; background: #fff; border: 1px solid #e0e0d8; border-radius: 10px; padding: 18px 20px;">
      <div style="width: 36px; height: 36px; border-radius: 8px; background: #E6F1FB; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; font-size: 18px;">🔗</div>
      <h4 style="font-size: 14px; font-weight: 600; margin: 0 0 6px; color: #1A1A1A;">Automation Flows</h4>
      <p style="font-size: 13px; color: #666; line-height: 1.55; margin: 0;">Build n8n and Zapier workflows that connect APIs, parse data, and trigger smart actions.</p>
      <a href="#" style="font-size: 12px; color: #0F6E56; font-weight: 500; display: inline-block; margin-top: 10px; text-decoration: none;">→ Labs</a>
    </div>
    <div style="flex: 1; min-width: 200px; margin-right: 14px; margin-bottom: 14px; background: #fff; border: 1px solid #e0e0d8; border-radius: 10px; padding: 18px 20px;">
      <div style="width: 36px; height: 36px; border-radius: 8px; background: #FAEEDA; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; font-size: 18px;">🚀</div>
      <h4 style="font-size: 14px; font-weight: 600; margin: 0 0 6px; color: #1A1A1A;">Capstone Launch</h4>
      <p style="font-size: 13px; color: #666; line-height: 1.55; margin: 0;">Ship a working AI-augmented tool your team can demonstrate to a real business audience.</p>
      <a href="#" style="font-size: 12px; color: #0F6E56; font-weight: 500; display: inline-block; margin-top: 10px; text-decoration: none;">→ Capstone brief</a>
    </div>
  </div>

  <!-- Section Header: Schedule -->
  <div style="margin-bottom: 16px;">
    <p style="font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #0F6E56; margin: 0 0 6px;">Schedule</p>
    <h2 style="font-size: 1.4rem; font-weight: 600; margin: 0 0 4px; color: #1A1A1A;">Recent and upcoming weeks</h2>
    <p style="font-size: 14px; color: #666; margin: 0 0 16px;">Click any week row to open the full module.</p>
  </div>

  <!-- Week Rows -->
  <div style="display: flex; border: 1px solid #e0e0d8; border-radius: 10px; overflow: hidden; margin-bottom: 12px;">
    <div style="background: #0F6E56; color: #fff; font-size: 10px; font-weight: 600; padding: 14px 10px; display: flex; align-items: center; justify-content: center; min-width: 44px; text-align: center; letter-spacing: 0.06em; text-transform: uppercase; line-height: 1.3;">Wk<br>12</div>
    <div style="padding: 14px 18px; flex: 1; background: #fff;">
      <h4 style="font-size: 14px; font-weight: 600; margin: 0 0 4px; color: #1A1A1A;">Prompt Engineering at Scale</h4>
      <p style="font-size: 13px; color: #666; margin: 0 0 8px; line-height: 1.5;">System prompts, chain-of-thought patterns, few-shot design, and output parsing.</p>
      <span style="font-size: 11px; font-weight: 500; padding: 3px 10px; border-radius: 20px; background: #EAF3DE; color: #3B6D11;">✓ Complete</span>
    </div>
  </div>

  <div style="display: flex; border: 2px solid #0F6E56; border-radius: 10px; overflow: hidden; margin-bottom: 12px;">
    <div style="background: #0F6E56; color: #fff; font-size: 10px; font-weight: 600; padding: 14px 10px; display: flex; align-items: center; justify-content: center; min-width: 44px; text-align: center; letter-spacing: 0.06em; text-transform: uppercase; line-height: 1.3;">Wk<br>14</div>
    <div style="padding: 14px 18px; flex: 1; background: #fff;">
      <h4 style="font-size: 14px; font-weight: 600; margin: 0 0 4px; color: #1A1A1A;">Agentic Workflows <em style="color: #0F6E56; font-size: 12px;">← Current</em></h4>
      <p style="font-size: 13px; color: #666; margin: 0 0 8px; line-height: 1.5;">Tool use, function calling, multi-agent coordination, and human-in-the-loop design.</p>
      <span style="font-size: 11px; font-weight: 500; padding: 3px 10px; border-radius: 20px; background: #FCEBEB; color: #A32D2D;">Due Sun</span>
      <span style="font-size: 11px; font-weight: 500; padding: 3px 10px; border-radius: 20px; background: #E6F1FB; color: #185FA5; margin-left: 6px;">Lecture</span>
      <span style="font-size: 11px; font-weight: 500; padding: 3px 10px; border-radius: 20px; background: #E6F1FB; color: #185FA5; margin-left: 6px;">Lab</span>
    </div>
  </div>

  <!-- Two-Column: Objectives + Deadlines -->
  <div style="display: flex; flex-wrap: wrap; margin-right: -14px; margin-bottom: 28px; margin-top: 8px;">
    <div style="flex: 1; min-width: 240px; margin-right: 14px; margin-bottom: 14px; background: #fff; border: 1px solid #e0e0d8; border-radius: 10px; padding: 18px 20px;">
      <h4 style="font-size: 14px; font-weight: 600; margin: 0 0 12px; color: #1A1A1A;">Learning Objectives</h4>
      <div style="display: flex; align-items: flex-start; margin-bottom: 10px;">
        <div style="width: 18px; height: 18px; border-radius: 50%; background: #0F6E56; flex-shrink: 0; margin-top: 1px; margin-right: 10px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #fff; font-weight: bold;">✓</div>
        <span style="font-size: 13px; color: #444; line-height: 1.5;">Design AI harnesses for real business workflows</span>
      </div>
      <div style="display: flex; align-items: flex-start; margin-bottom: 10px;">
        <div style="width: 18px; height: 18px; border-radius: 50%; background: #0F6E56; flex-shrink: 0; margin-top: 1px; margin-right: 10px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #fff; font-weight: bold;">✓</div>
        <span style="font-size: 13px; color: #444; line-height: 1.5;">Build and deploy automation pipelines</span>
      </div>
      <div style="display: flex; align-items: flex-start;">
        <div style="width: 18px; height: 18px; border-radius: 50%; background: #0F6E56; flex-shrink: 0; margin-top: 1px; margin-right: 10px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #fff; font-weight: bold;">✓</div>
        <span style="font-size: 13px; color: #444; line-height: 1.5;">Communicate AI strategy to non-technical stakeholders</span>
      </div>
    </div>
    <div style="flex: 1; min-width: 240px; margin-right: 14px; margin-bottom: 14px; background: #fff; border: 1px solid #e0e0d8; border-radius: 10px; padding: 18px 20px;">
      <h4 style="font-size: 14px; font-weight: 600; margin: 0 0 12px; color: #1A1A1A;">Upcoming Deadlines</h4>
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0ea;">
        <span style="font-size: 13px; color: #333;">Lab 14 — Agents</span>
        <span style="font-size: 12px; color: #854F0B; font-weight: 500; background: #FAEEDA; padding: 3px 9px; border-radius: 20px;">Apr 27</span>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0ea;">
        <span style="font-size: 13px; color: #333;">Reflection 4</span>
        <span style="font-size: 12px; color: #854F0B; font-weight: 500; background: #FAEEDA; padding: 3px 9px; border-radius: 20px;">Apr 29</span>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0;">
        <span style="font-size: 13px; color: #333;">Capstone Draft</span>
        <span style="font-size: 12px; color: #854F0B; font-weight: 500; background: #FAEEDA; padding: 3px 9px; border-radius: 20px;">May 3</span>
      </div>
    </div>
  </div>

  <!-- Footer Bar -->
  <div style="background: #085041; border-radius: 12px; padding: 20px 28px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;">
    <p style="color: rgba(255,255,255,0.75); font-size: 13px; margin: 0 16px 0 0;">Questions? Office hours Mon/Wed 2–3 PM · Zoom link in Canvas</p>
    <a href="mailto:kevin.lastname@boisestate.edu" style="color: #5DCAA5; font-size: 13px; font-weight: 500; text-decoration: none;">Email Prof. Kevin →</a>
  </div>

</div>
```

---

## Customization Checklist

Before publishing, update:
- [ ] Semester tag in hero (e.g., "Spring 2026 · ITM 370")
- [ ] Course name in hero H2
- [ ] Course description paragraph
- [ ] Navigation `href` values with actual Canvas course URLs
- [ ] Current week callout text and deadline
- [ ] Feature card titles, descriptions, and icons
- [ ] Week row content (titles, descriptions, pills)
- [ ] Learning objectives list items
- [ ] Deadlines list items and dates
- [ ] Office hours and contact email in footer

---

## Canvas URL Patterns

Use these URL patterns for navigation links:

```
/courses/COURSE_ID               → Course home
/courses/COURSE_ID/modules       → All modules
/courses/COURSE_ID/assignments   → All assignments
/courses/COURSE_ID/discussion_topics → Discussions
/courses/COURSE_ID/grades        → Grades
/courses/COURSE_ID/assignments/syllabus → Syllabus
/courses/COURSE_ID/pages/PAGE_SLUG → Specific page
```

Find your COURSE_ID in the URL when viewing your course.

> **Tip:** Use the Canvas Course Link tool in the RCE (the link icon → Course Link) to auto-generate Canvas-internal links that update correctly when courses are copied for new semesters.

---

## See Also

- [Component Library](../03-design-systems/Component-Library.md) - individual components used in this pattern
- [Accessibility Overview](../06-accessibility/Accessibility-Overview.md) - checks to run before publishing
