// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {IERC20} from "@thirdweb-dev/contracts/eip/interface/IERC20.sol";
import {Ownable} from "@thirdweb-dev/contracts/extension/Ownable.sol";
import {ReentrancyGuard} from "@thirdweb-dev/contracts/external-deps/openzeppelin/security/ReentrancyGuard.sol";


contract SimplePredictionMarket is Ownable, ReentrancyGuard {
    enum MarketOutcome {
        UNRESOLVED,
        OPTION_A,
        OPTION_B
    }

    struct Market {
        string question;
        uint256 endTime;
        MarketOutcome outcome;
        string optionA;
        string optionB;
        uint256 totalOptionAShares;
        uint256 totalOptionBShares;
        bool resolved;
        mapping(address => uint256) optionASharesBalance;
        mapping(address => uint256) optionBSharesBalance;
        mapping(address => bool) hasClaimed;
    }

    IERC20 public bettingToken;
    uint256 public marketCount;
    mapping(uint256 => Market) public markets;

    event MarketCreated(
        uint256 indexed marketId,
        string question,
        string optionA,
        string optionB,
        uint256 endTime
    );

    event SharesPurchased(
        uint256 indexed marketId,
        address indexed buyer,
        bool isOptionA,
        uint256 amount
    );

    event MarketResolved(uint256 indexed marketId, MarketOutcome outcome);

    event Claimed(
        uint256 indexed marketId,
        address indexed user,
        uint256 amount
    );

    function _canSetOwner() internal view virtual override returns (bool) {
        return msg.sender == owner();
    }

    constructor(address _bettingToken) {
        bettingToken = IERC20(_bettingToken);
        _setupOwner(msg.sender);
    }

    function createMarket(
        string memory _question,
        string memory _optionA,
        string memory _optionB,
        uint256 _duration
    ) external returns (uint256) {
        require(msg.sender == owner(), "Only owner can create markets");
        require(_duration > 0, "Duration must be greater than 0");
        require(
            bytes(_optionA).length > 0 && bytes(_optionB).length > 0,
            "Options cannot be empty"
        );

        uint256 marketId = marketCount++;
        Market storage market = markets[marketId];
        market.question = _question;
        market.optionA = _optionA;
        market.optionB = _optionB;
        market.endTime = block.timestamp + _duration;
        market.outcome = MarketOutcome.UNRESOLVED;

        emit MarketCreated(marketId, _question, _optionA, _optionB, _duration);

        return marketId;
    }

    function buyShares(
        uint256 _marketId,
        bool _isOptionA,
        uint256 _amount
    ) external nonReentrant {
        Market storage market = markets[_marketId];
        require(
            block.timestamp < market.endTime,
            "Market trading period has ended"
        );
        require(!market.resolved, "Market has already been resolved");
        require(_amount > 0, "Amount must be greater than 0");
        require(
            bettingToken.transferFrom(msg.sender, address(this), _amount),
            "Transfer failed"
        );

        if (_isOptionA) {
            market.totalOptionAShares += _amount;
            market.optionASharesBalance[msg.sender] += _amount;
        } else {
            market.totalOptionBShares += _amount;
            market.optionBSharesBalance[msg.sender] += _amount;
        }

        emit SharesPurchased(_marketId, msg.sender, _isOptionA, _amount);
    }

    function resolveMarket(uint256 _marketId, MarketOutcome _outcome) external {
        require(msg.sender == owner(), "Only owner can resolve markets");
        Market storage market = markets[_marketId];
        require(
            block.timestamp >= market.endTime,
            "Market trading period has not ended"
        );
        require(!market.resolved, "Market has already been resolved");
        require(_outcome != MarketOutcome.UNRESOLVED, "Invalid outcome");

        market.outcome = _outcome;
        market.resolved = true;

        emit MarketResolved(_marketId, _outcome);
    }

    function claimWinnings(uint256 _marketId) external nonReentrant {
        Market storage market = markets[_marketId];
        require(market.resolved, "Market not resolved yet");

        uint256 userShares;
        uint256 winningShares;
        uint256 losingShares;

        if (market.outcome == MarketOutcome.OPTION_A) {
            userShares = market.optionASharesBalance[msg.sender];
            winningShares = market.totalOptionAShares;
            losingShares = market.totalOptionBShares;
            market.optionASharesBalance[msg.sender] = 0;
        } else if (market.outcome == MarketOutcome.OPTION_B) {
            userShares = market.optionBSharesBalance[msg.sender];
            winningShares = market.totalOptionBShares;
            losingShares = market.totalOptionAShares;
            market.optionBSharesBalance[msg.sender] = 0;
        } else {
            revert("Market outcome is not valid");
        }

        require(userShares > 0, "No winnings to claim");

        // calculate the reward ratio
        uint256 rewardRatio = (losingShares * 1e18) / winningShares;

        // calculate the winnings: originla stake + proportional share of losing funds
        uint256 winnings = userShares + (userShares * rewardRatio) / 1e18;

        require(bettingToken.transfer(msg.sender, winnings), "Transfer failed");

        emit Claimed(_marketId, msg.sender, winnings);
    }

    function getMarketInfo(
        uint256 _marketId
    )
        external
        view
        returns (
            string memory question,
            string memory optionA,
            string memory optionB,
            uint256 endTime,
            MarketOutcome outcome,
            uint256 totalOptionAShares,
            uint256 totalOptionBShares,
            bool resolved
        )
    {
        Market storage market = markets[_marketId];
        return (
            market.question,
            market.optionA,
            market.optionB,
            market.endTime,
            market.outcome,
            market.totalOptionAShares,
            market.totalOptionBShares,
            market.resolved
        );
    }

    function getSharesBalance(
        uint256 _marketId,
        address _user
    ) external view returns (uint256 optionAShares, uint256 optionBShares) {
        Market storage market = markets[_marketId];
        return (
            market.optionASharesBalance[_user],
            market.optionBSharesBalance[_user]
        );
    }
}
