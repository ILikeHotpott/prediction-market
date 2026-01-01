from ..models import MarketOption


def binary_options_from_payload(options_data):
    """
    Ensure a market has YES/NO options with sides and default pricing.
    Caller will create stats with equal split.
    """
    if not isinstance(options_data, list) or len(options_data) == 0:
        return [
            MarketOption(option_index=0, title="NO", side="no"),
            MarketOption(option_index=1, title="YES", side="yes"),
        ]

    opts = []
    for idx, raw in enumerate(options_data):
        title_val = (raw or {}).get("title") or (raw or {}).get("name")
        side_val = (raw or {}).get("side")
        if not title_val:
            continue
        opts.append(
            MarketOption(
                option_index=idx,
                title=title_val,
                is_active=raw.get("is_active", True),
                onchain_outcome_id=raw.get("onchain_outcome_id"),
                side=side_val,
            )
        )

    yes_opt = next((o for o in opts if (o.side or "").lower() == "yes"), None)
    no_opt = next((o for o in opts if (o.side or "").lower() == "no"), None)

    if not no_opt:
        no_opt = MarketOption(option_index=0, title="NO", side="no", is_active=True)
    if not yes_opt:
        yes_opt = MarketOption(option_index=1, title="YES", side="yes", is_active=True)

    binary_opts = [no_opt, yes_opt]
    for idx, opt in enumerate(binary_opts):
        opt.option_index = idx
    return binary_opts


