// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { ILiFi } from "../Interfaces/ILiFi.sol";
import { IHopBridge } from "../Interfaces/IHopBridge.sol";
import { LibAsset, IERC20 } from "../Libraries/LibAsset.sol";
import { LibDiamond } from "../Libraries/LibDiamond.sol";
import { CannotBridgeToSameNetwork, NativeValueWithERC, InvalidReceiver, InvalidAmount, InvalidConfig, InvalidSendingToken, AlreadyInitialized, NotInitialized } from "../Errors/GenericErrors.sol";
import { SwapperV2, LibSwap } from "../Helpers/SwapperV2.sol";
import { LibUtil } from "../Libraries/LibUtil.sol";
import { Validatable } from "../Helpers/Validatable.sol";

/// @title Hop Facet (Optimized)
/// @author LI.FI (https://li.fi)
/// @notice Provides functionality for bridging through Hop
contract HopFacetoptimized is ILiFi, SwapperV2, Validatable {
    /// Types ///

    struct HopData {
        uint256 bonderFee;
        uint256 amountOutMin;
        uint256 deadline;
        uint256 destinationAmountOutMin;
        uint256 destinationDeadline;
        IHopBridge hopBridge;
    }

    /// Events ///

    event HopBridgeRegistered(address indexed assetId, address bridge);

    /// External Methods ///

    /// @notice Sets approval for the Hop Bridge to spend the specified token
    /// @param bridges The Hop Bridges to approve
    /// @param tokenToApprove The token to approve
    function setApprovalForBridges(address[] calldata bridges, address tokenToApprove) external {
        for (uint256 i; i < bridges.length; i++) {
            // Give Hop approval to bridge tokens
            LibAsset.maxApproveERC20(IERC20(tokenToApprove), address(bridges[i]), type(uint256).max);
        }
    }

    // TODO: startBridgeTokensViaHopL1ERC20
    function startBridgeTokensViaHopL1ERC20(ILiFi.BridgeData calldata _bridgeData, HopData calldata _hopData)
        external
        payable
        validateBridgeData(_bridgeData)
    {}

    // TODO: startBridgeTokensViaHopL1Native
    function startBridgeTokensViaHopL1Native(ILiFi.BridgeData calldata _bridgeData, HopData calldata _hopData)
        external
        payable
        validateBridgeData(_bridgeData)
    {}

    // TODO: swapAndStartBridgeTokensViaHopL1ERC20
    function swapAndStartBridgeTokensViaHopL1ERC20(
        ILiFi.BridgeData calldata _bridgeData,
        LibSwap.SwapData calldata _swapData,
        HopData calldata _hopData
    ) external payable validateBridgeData(_bridgeData) {}

    // TODO: swapAndStartBridgeTokensViaHopL1Native
    function swapAndStartBridgeTokensViaHopL1Native(
        ILiFi.BridgeData calldata _bridgeData,
        LibSwap.SwapData calldata _swapData,
        HopData calldata _hopData
    ) external payable validateBridgeData(_bridgeData) {}

    // TODO: startBridgeTokensViaHopL2ERC20
    function startBridgeTokensViaHopL2ERC20(ILiFi.BridgeData calldata _bridgeData, HopData calldata _hopData)
        external
        payable
        validateBridgeData(_bridgeData)
    {}

    // TODO: startBridgeTokensViaHopL2Native
    function startBridgeTokensViaHopL2Native(ILiFi.BridgeData calldata _bridgeData, HopData calldata _hopData)
        external
        payable
        validateBridgeData(_bridgeData)
    {}

    // TODO: swapAndStartBridgeTokensViaHopL2ERC20
    function swapAndStartBridgeTokensViaHopL2ERC20(
        ILiFi.BridgeData calldata _bridgeData,
        LibSwap.SwapData calldata _swapData,
        HopData calldata _hopData
    ) external payable validateBridgeData(_bridgeData) {}

    // TODO: swapAndStartBridgeTokensViaHopL2Native
    function swapAndStartBridgeTokensViaHopL2Native(
        ILiFi.BridgeData calldata _bridgeData,
        LibSwap.SwapData calldata _swapData,
        HopData calldata _hopData
    ) external payable validateBridgeData(_bridgeData) {}
}
