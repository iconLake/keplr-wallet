import React, { FunctionComponent, useMemo } from "react";
import { MsgHistory } from "../types";
import { observer } from "mobx-react-lite";
import { MsgItemBase } from "./base";
import { ItemLogo } from "./logo";
import { ColorPalette } from "../../../../styles";
import { MessageVoteIcon } from "../../../../components/icon";
import { useTheme } from "styled-components";

export const MsgRelationVote: FunctionComponent<{
  msg: MsgHistory;
  prices?: Record<string, Record<string, number | undefined> | undefined>;
  targetDenom: string;
  isInAllActivitiesPage: boolean | undefined;
}> = observer(({ msg, prices, targetDenom, isInAllActivitiesPage }) => {
  const theme = useTheme();

  const proposal: {
    proposalId: string;
  } = useMemo(() => {
    return {
      proposalId: (msg.msg as any)["proposal_id"],
    };
  }, [msg.msg]);

  const voteText: {
    text: string;
    color: string;
  } = useMemo(() => {
    const optionTextColor =
      theme.mode === "light"
        ? ColorPalette["gray-700"]
        : ColorPalette["gray-10"];

    switch ((msg.msg as any)["option"]) {
      case "VOTE_OPTION_YES":
        return {
          text: "Yes",
          color: optionTextColor,
        };
      case "VOTE_OPTION_NO":
        return {
          text: "No",
          color: optionTextColor,
        };
      case "VOTE_OPTION_NO_WITH_VETO":
        return {
          text: "NWV",
          color: ColorPalette["yellow-400"],
        };
      case "VOTE_OPTION_ABSTAIN":
        return {
          text: "Abstain",
          color: optionTextColor,
        };
      default:
        return {
          text: "Unknown",
          color: optionTextColor,
        };
    }
  }, [msg.msg, theme.mode]);

  return (
    <MsgItemBase
      logo={
        <ItemLogo center={<MessageVoteIcon width="2rem" height="2rem" />} />
      }
      chainId={msg.chainId}
      title="Vote"
      paragraph={`#${proposal.proposalId}`}
      amount={voteText.text}
      overrideAmountColor={voteText.color}
      prices={prices || {}}
      msg={msg}
      targetDenom={targetDenom}
      isInAllActivitiesPage={isInAllActivitiesPage}
    />
  );
});
