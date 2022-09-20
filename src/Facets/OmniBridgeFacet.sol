// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import { ILiFi } from "../Interfaces/ILiFi.sol";
import { IOmniBridge } from "../Interfaces/IOmniBridge.sol";
import { LibAsset, IERC20 } from "../Libraries/LibAsset.sol";
import { ReentrancyGuard } from "../Helpers/ReentrancyGuard.sol";
import { InvalidAmount, InvalidReceiver } from "../Errors/GenericErrors.sol";
import { SwapperV2, LibSwap } from "../Helpers/SwapperV2.sol";

/// @title OmniBridge Facet
/// @author LI.FI (https://li.fi)
/// @notice Provides functionality for bridging through OmniBridge
contract OmniBridgeFacet is ILiFi, SwapperV2, ReentrancyGuard {
    /// Types ///

    uint64 internal constant GNOSIS_CHAIN_ID = 100;

    struct OmniData {
        address bridge;
    }

    /// External Methods ///

    /// @notice Bridges tokens via OmniBridge
    /// @param _bridgeData Data contaning core information for bridging
    /// @param _omniData Data specific to bridge
    function startBridgeTokensViaOmniBridge(ILiFi.BridgeData memory _bridgeData, OmniData calldata _omniData)
        external
        payable
        nonReentrant
    {
        if (_bridgeData.receiver == address(0)) {
            revert InvalidReceiver();
        }
        LibAsset.depositAsset(_bridgeData.sendingAssetId, _bridgeData.minAmount);
        _startBridge(_bridgeData, _omniData, _bridgeData.minAmount, false);
    }

    /// @notice Performs a swap before bridging via OmniBridge
    /// @param _bridgeData Data contaning core information for bridging
    /// @param _swapData An array of swap related data for performing swaps before bridging
    /// @param _omniData Data specific to bridge
    function swapAndStartBridgeTokensViaOmniBridge(
        ILiFi.BridgeData memory _bridgeData,
        LibSwap.SwapData[] calldata _swapData,
        OmniData calldata _omniData
    ) external payable nonReentrant {
        if (_bridgeData.receiver == address(0)) {
            revert InvalidReceiver();
        }
        LibAsset.depositAssets(_swapData);
        uint256 amount = _executeAndCheckSwaps(
            _bridgeData.transactionId,
            _bridgeData.minAmount,
            _swapData,
            payable(msg.sender)
        );
        _startBridge(_bridgeData, _omniData, amount, true);
    }

    /// Private Methods ///

    /// @dev Contains the business logic for the bridge via OmniBridge
    /// @param _bridgeData Data contaning core information for bridging
    /// @param _omniData Data specific to OmniBridge
    /// @param _amount Amount to bridge
    /// @param _hasSourceSwap Did swap on sending chain
    function _startBridge(
        ILiFi.BridgeData memory _bridgeData,
        OmniData calldata _omniData,
        uint256 _amount,
        bool _hasSourceSwap
    ) private {
        IOmniBridge bridge = IOmniBridge(_omniData.bridge);
        if (LibAsset.isNativeAsset(_bridgeData.sendingAssetId)) {
            bridge.wrapAndRelayTokens{ value: _amount }(_bridgeData.receiver);
        } else {
            LibAsset.maxApproveERC20(IERC20(_bridgeData.sendingAssetId), _omniData.bridge, _amount);

            bridge.relayTokens(_bridgeData.sendingAssetId, _bridgeData.receiver, _amount);
        }

        emit LiFiTransferStarted(_bridgeData);
    }
}
