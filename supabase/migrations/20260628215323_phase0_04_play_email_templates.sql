-- Phase-0 (4/n) — 4 per-play marketing_email_templates + v1 versions (PLAN-INT-C §4).
-- Content-only: {{unsubscribe_url}} + {{agency_postal_address}} are placeholders Levitate fills/enforces.
-- org_id = workspace (single tenant, per the identity-bridge decision). category='cross_sell'.
DO $$
DECLARE
  v_org uuid := 'f1f07037-3032-45f8-93ca-72c0f47e4fbb';
  v_tid uuid; v_vid uuid;
  v_merge text[] := ARRAY['first_name','current_carrier','specific_gap','canopy_link','rec_item','producer_name','agency_name','agency_postal_address','unsubscribe_url'];
BEGIN
  INSERT INTO marketing_email_templates (org_id, name, description, category, message_classification, is_active)
  VALUES (v_org,'phase0_home_only_sell_auto','Phase-0 cross-sell: home-only households, sell auto','cross_sell','marketing',true) RETURNING id INTO v_tid;
  INSERT INTO marketing_email_template_versions (org_id, template_id, version_number, subject, body_html, body_text, merge_fields_used)
  VALUES (v_org, v_tid, 1,
    $s${{first_name}}, your home's covered — is your car leaving money on the table?$s$,
    $h$<p>Hi {{first_name}},</p><p>We already protect your home, and we noticed we're not currently helping with your auto. Share your current auto policy in 30 seconds and we'll show you exactly where you're exposed:</p><p><a href="{{canopy_link}}">{{canopy_link}}</a></p><p>It pulls your current {{current_carrier}} coverage securely so we compare apples to apples.</p><p>— {{producer_name}}, {{agency_name}}<br>{{agency_postal_address}}</p><p>{{unsubscribe_url}}</p>$h$,
    $t$Hi {{first_name}}, share your current auto policy in 30 seconds: {{canopy_link}} — {{producer_name}}, {{agency_name}} {{agency_postal_address}} {{unsubscribe_url}}$t$, v_merge) RETURNING id INTO v_vid;
  UPDATE marketing_email_templates SET current_version_id = v_vid WHERE id = v_tid;

  INSERT INTO marketing_email_templates (org_id, name, description, category, message_classification, is_active)
  VALUES (v_org,'phase0_auto_only_sell_home','Phase-0 cross-sell: auto-only households, sell home','cross_sell','marketing',true) RETURNING id INTO v_tid;
  INSERT INTO marketing_email_template_versions (org_id, template_id, version_number, subject, body_html, body_text, merge_fields_used)
  VALUES (v_org, v_tid, 1,
    $s${{first_name}}, one quick check on your home coverage$s$,
    $h$<p>Hi {{first_name}},</p><p>We insure your auto, but not your home — and homeowner coverage gaps (replacement cost, water backup, liability limits) hurt most in a claim. Share your current home policy in 30 seconds:</p><p><a href="{{canopy_link}}">{{canopy_link}}</a></p><p>— {{producer_name}}, {{agency_name}}<br>{{agency_postal_address}}</p><p>{{unsubscribe_url}}</p>$h$,
    $t$Hi {{first_name}}, share your current home policy in 30 seconds: {{canopy_link}} — {{producer_name}}, {{agency_name}} {{agency_postal_address}} {{unsubscribe_url}}$t$, v_merge) RETURNING id INTO v_vid;
  UPDATE marketing_email_templates SET current_version_id = v_vid WHERE id = v_tid;

  INSERT INTO marketing_email_templates (org_id, name, description, category, message_classification, is_active)
  VALUES (v_org,'phase0_umbrella_add','Phase-0 cross-sell: auto+home, add umbrella','cross_sell','marketing',true) RETURNING id INTO v_tid;
  INSERT INTO marketing_email_template_versions (org_id, template_id, version_number, subject, body_html, body_text, merge_fields_used)
  VALUES (v_org, v_tid, 1,
    $s${{first_name}}, are your assets covered above your auto/home limits?$s$,
    $h$<p>Hi {{first_name}},</p><p>You carry auto and home with us, but no umbrella. One at-fault accident or lawsuit can blow past your underlying limits. Verify your underlying limits in 30 seconds:</p><p><a href="{{canopy_link}}">{{canopy_link}}</a></p><p>— {{producer_name}}, {{agency_name}}<br>{{agency_postal_address}}</p><p>{{unsubscribe_url}}</p>$h$,
    $t$Hi {{first_name}}, verify your underlying limits in 30 seconds: {{canopy_link}} — {{producer_name}}, {{agency_name}} {{agency_postal_address}} {{unsubscribe_url}}$t$, v_merge) RETURNING id INTO v_vid;
  UPDATE marketing_email_templates SET current_version_id = v_vid WHERE id = v_tid;

  INSERT INTO marketing_email_templates (org_id, name, description, category, message_classification, is_active)
  VALUES (v_org,'phase0_rec_sell_auto','Phase-0 cross-sell: specialty/rec households, sell auto','cross_sell','marketing',true) RETURNING id INTO v_tid;
  INSERT INTO marketing_email_template_versions (org_id, template_id, version_number, subject, body_html, body_text, merge_fields_used)
  VALUES (v_org, v_tid, 1,
    $s${{first_name}}, your {{rec_item}} is insured — what about the truck that tows it?$s$,
    $h$<p>Hi {{first_name}},</p><p>We cover your {{rec_item}}, but we're not on your auto. The same 30-second check shows where your auto coverage is thin:</p><p><a href="{{canopy_link}}">{{canopy_link}}</a></p><p>— {{producer_name}}, {{agency_name}}<br>{{agency_postal_address}}</p><p>{{unsubscribe_url}}</p>$h$,
    $t$Hi {{first_name}}, the same 30-second check shows where your auto coverage is thin: {{canopy_link}} — {{producer_name}}, {{agency_name}} {{agency_postal_address}} {{unsubscribe_url}}$t$, v_merge) RETURNING id INTO v_vid;
  UPDATE marketing_email_templates SET current_version_id = v_vid WHERE id = v_tid;
END $$;
