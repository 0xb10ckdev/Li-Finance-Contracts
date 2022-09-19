// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import { ILiFi } from "../Interfaces/ILiFi.sol";
import { IGatewayRouter } from "../Interfaces/IGatewayRouter.sol";
import { LibAsset, IERC20 } from "../Libraries/LibAsset.sol";
import { ReentrancyGuard } from "../Helpers/ReentrancyGuard.sol";
import { InvalidAmount, InvalidReceiver } from "../Errors/GenericErrors.sol";
import { SwapperV2, LibSwap } from "../Helpers/SwapperV2.sol";

/// @title Arbitrum Bridge Facet
/// @author Li.Finance (https://li.finance)
/// @notice Provides functionality for bridging through Arbitrum Bridge
contract ArbitrumBridgeFacet is ILiFi, SwapperV2, ReentrancyGuard {
    /// Storage ///

    /// @notice Chain id of Arbitrum.
    uint64 private constant ARB_CHAIN_ID = 42161;

    /// @notice The contract address of the gateway router on the source chain.
    IGatewayRouter private immutable gatewayRouter;

    /// @notice The contract address of the inbox on the source chain.
    IGatewayRouter private immutable inbox;

    /// Types ///

    /// @param assetId The contract address of the token being bridged on sending chain.
    /// @param amount The amount of tokens to bridge.
    /// @param receiver The address you are sending funds (and potentially data) to.
    /// @param tokenRouter Token router address for sending token.
    /// @param maxSubmissionCost Max gas deducted from user's L2 balance to cover base submission fee.
    /// @param maxGas Max gas deducted from user's L2 balance to cover L2 execution.
    /// @param maxGasPrice price bid for L2 execution.
    struct BridgeData {
        address assetId;
        uint256 amount;
        address receiver;
        address tokenRouter;
        uint256 maxSubmissionCost;
        uint256 maxGas;
        uint256 maxGasPrice;
    }

    /// Constructor ///

    /// @notice Initialize the contract.
    /// @param _gatewayRouter The contract address of the gateway router on the source chain.
    /// @param _inbox The contract address of the inbox on the source chain.
    constructor(IGatewayRouter _gatewayRouter, IGatewayRouter _inbox) {
        gatewayRouter = _gatewayRouter;
        inbox = _inbox;
    }

    /// External Methods ///

    /// @notice Bridges tokens via Arbitrum Bridge
    /// @param _lifiData Data used purely for tracking and analytics
    /// @param _bridgeData Data for gateway router address, asset id and amount
    function startBridgeTokensViaArbitrumBridge(LiFiData calldata _lifiData, BridgeData calldata _bridgeData)
        external
        payable
        nonReentrant
    {
        if (_bridgeData.receiver == address(0)) {
            revert InvalidReceiver();
        }

        uint256 cost = _bridgeData.maxSubmissionCost + _bridgeData.maxGas * _bridgeData.maxGasPrice;
        LibAsset.depositAssetWithFee(_bridgeData.assetId, _bridgeData.amount, cost);
        _startBridge(_lifiData, _bridgeData, _bridgeData.amount, cost, false);
    }

    /// @notice Performs a swap before bridging via Arbitrum Bridge
    /// @param _lifiData Data used purely for tracking and analytics
    /// @param _swapData An array of swap related data for performing swaps before bridging
    /// @param _bridgeData Data for gateway router address, asset id and amount
    function swapAndStartBridgeTokensViaArbitrumBridge(
        LiFiData calldata _lifiData,
        LibSwap.SwapData[] calldata _swapData,
        BridgeData calldata _bridgeData
    ) external payable nonReentrant {
        if (_bridgeData.receiver == address(0)) {
            revert InvalidReceiver();
        }

        uint256 amount = _executeAndCheckSwaps(_lifiData, _swapData, payable(msg.sender));
        uint256 cost = _bridgeData.maxSubmissionCost + _bridgeData.maxGas * _bridgeData.maxGasPrice;
        _startBridge(_lifiData, _bridgeData, amount, cost, true);
    }

    /// Private Methods ///

    /// @dev Contains the business logic for the bridge via Arbitrum Bridge
    /// @param _lifiData Data used purely for tracking and analytics
    /// @param _bridgeData Data for gateway router address, asset id and amount
    /// @param _amount Amount to bridge
    /// @param _cost Additional amount of native asset for the fee
    /// @param _hasSourceSwap Did swap on sending chain
    function _startBridge(
        LiFiData calldata _lifiData,
        BridgeData calldata _bridgeData,
        uint256 _amount,
        uint256 _cost,
        bool _hasSourceSwap
    ) private {
        if (LibAsset.isNativeAsset(_bridgeData.assetId)) {
            inbox.createRetryableTicketNoRefundAliasRewrite{ value: _amount + _cost }(
                _bridgeData.receiver,
                _amount, // l2CallValue
                _bridgeData.maxSubmissionCost,
                _bridgeData.receiver, // excessFeeRefundAddress
                _bridgeData.receiver, // callValueRefundAddress
                _bridgeData.maxGas,
                _bridgeData.maxGasPrice,
                ""
            );
        } else {
            LibAsset.maxApproveERC20(IERC20(_bridgeData.assetId), _bridgeData.tokenRouter, _amount);

            gatewayRouter.outboundTransfer{ value: _cost }(
                _bridgeData.assetId,
                _bridgeData.receiver,
                _amount,
                _bridgeData.maxGas,
                _bridgeData.maxGasPrice,
                abi.encode(_bridgeData.maxSubmissionCost, "")
            );
        }

        emit LiFiTransferStarted(
            _lifiData.transactionId,
            "arbitrum",
            "",
            _lifiData.integrator,
            _lifiData.referrer,
            _bridgeData.assetId,
            _lifiData.receivingAssetId,
            _bridgeData.receiver,
            _bridgeData.amount,
            ARB_CHAIN_ID,
            _hasSourceSwap,
            false
        );
    }
}
