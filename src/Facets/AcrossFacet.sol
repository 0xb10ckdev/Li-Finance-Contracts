// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ILiFi } from "../Interfaces/ILiFi.sol";
import { IAcrossSpokePool } from "../Interfaces/IAcrossSpokePool.sol";
import { LibAsset } from "../Libraries/LibAsset.sol";
import { LibSwap } from "../Libraries/LibSwap.sol";
import { ReentrancyGuard } from "../Helpers/ReentrancyGuard.sol";
import { SwapperV2 } from "../Helpers/SwapperV2.sol";

/// @title Across Facet
/// @author LI.FI (https://li.fi)
/// @notice Provides functionality for bridging through Across Protocol
contract AcrossFacet is ILiFi, ReentrancyGuard, SwapperV2 {
    /// Storage ///

    /// @notice The contract address of the spoke pool on the source chain.
    IAcrossSpokePool private immutable spokePool;

    /// Errors

    error QuoteTimeout();

    /// Types ///

    /// @param weth The contract address of the WETH token on the current chain.
    /// @param assetId The contract address of the token being bridged.
    /// @param amount The amount of tokens to bridge.
    /// @param receiver The address of the token receiver after bridging.
    /// @param destinationChainId The chainId of the chain to bridge to.
    /// @param relayerFeePct The relayer fee in token percentage with 18 decimals.
    /// @param quoteTimestamp The timestamp associated with the suggested fee.
    struct AcrossData {
        address weth;
        address assetId;
        uint256 amount;
        address receiver;
        uint256 destinationChainId;
        uint64 relayerFeePct;
        uint32 quoteTimestamp;
    }

    /// Constructor ///

    /// @notice Initialize the contract.
    /// @param _spokePool The contract address of the spoke pool on the source chain.
    constructor(IAcrossSpokePool _spokePool) {
        spokePool = _spokePool;
    }

    /// External Methods ///

    /// @notice Bridges tokens via Across
    /// @param _lifiData data used purely for tracking and analytics
    /// @param _acrossData data specific to Across
    function startBridgeTokensViaAcross(LiFiData calldata _lifiData, AcrossData calldata _acrossData)
        external
        payable
        nonReentrant
    {
        LibAsset.depositAsset(_acrossData.assetId, _acrossData.amount);
        _startBridge(_lifiData, _acrossData, false);
    }

    /// @notice Performs a swap before bridging via Across
    /// @param _lifiData data used purely for tracking and analytics
    /// @param _swapData an array of swap related data for performing swaps before bridging
    /// @param _acrossData data specific to Across
    function swapAndStartBridgeTokensViaAcross(
        LiFiData calldata _lifiData,
        LibSwap.SwapData[] calldata _swapData,
        AcrossData memory _acrossData
    ) external payable nonReentrant {
        _acrossData.amount = _executeAndCheckSwaps(_lifiData, _swapData, payable(msg.sender));
        _startBridge(_lifiData, _acrossData, true);
    }

    /// Internal Methods ///

    /// @dev Contains the business logic for the bridge via Across
    /// @param _lifiData data used purely for tracking and analytics
    /// @param _acrossData data specific to Across
    /// @param _hasSourceSwaps whether or not the bridge has source swaps
    function _startBridge(
        LiFiData calldata _lifiData,
        AcrossData memory _acrossData,
        bool _hasSourceSwaps
    ) internal {
        if (_acrossData.quoteTimestamp > block.timestamp + 10 minutes) {
            revert QuoteTimeout();
        }

        bool isNative = _acrossData.assetId == LibAsset.NATIVE_ASSETID;
        if (isNative) {
            _acrossData.assetId = _acrossData.weth;
        } else {
            LibAsset.maxApproveERC20(IERC20(_acrossData.assetId), address(spokePool), _acrossData.amount);
        }

        spokePool.deposit{ value: isNative ? _acrossData.amount : 0 }(
            _acrossData.receiver,
            _acrossData.assetId,
            _acrossData.amount,
            _acrossData.destinationChainId,
            _acrossData.relayerFeePct,
            _acrossData.quoteTimestamp
        );

        emit LiFiTransferStarted(
            _lifiData.transactionId,
            "across",
            "",
            _lifiData.integrator,
            _lifiData.referrer,
            _acrossData.assetId,
            _lifiData.receivingAssetId,
            _acrossData.receiver,
            _acrossData.amount,
            _acrossData.destinationChainId,
            _hasSourceSwaps,
            false
        );
    }
}
